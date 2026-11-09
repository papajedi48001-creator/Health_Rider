#!/usr/bin/env python3
"""Health Rider host updater.

Runs on the application server (not in Docker) from a systemd timer every minute, as root. It:
  * fetches release tags (v1.2.3) from GitHub every few minutes, or at once when an admin asks;
  * writes status.json for the web app: the versions it can install, the running job and past jobs;
  * takes request.json left by an admin on the "อัปเดตระบบ" page and installs that version: backs up the
    database, checks out the tag, rebuilds with docker compose and checks that the new version answers.
    If it does not, it checks out the previous version again and rebuilds that.

The web container only writes request.json; everything it asks for is checked again here. Versions older
than the rollback floor (the first version that has this updater) are never installed.

Settings come from environment variables, set in /etc/health-rider-updater.env by install.sh.
Only the Python standard library is used.
"""

from __future__ import annotations

import datetime as dt
import fcntl
import gzip
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import uuid

# Never install anything older than this, whatever a manifest says: older versions have no updater.
HARD_FLOOR = "1.0.0"
VERSION = re.compile(r"^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$")
TAG = re.compile(r"^v((0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3}))$")
MANIFEST_PATH = "platform/releases.json"
HISTORY_LIMIT = 30


def env(name: str, default: str) -> str:
    value = os.environ.get(name, "").strip()
    return value or default


class Config:
    def __init__(self) -> None:
        self.repo = env("HR_REPO_DIR", "/opt/health-rider")
        self.state = env("HR_STATE_DIR", "/var/lib/health-rider-updater")
        self.compose_dir = env("HR_COMPOSE_DIR", os.path.join(self.repo, "platform"))
        self.compose_file = env("HR_COMPOSE_FILE", "compose.production.yaml")
        self.env_file = env("HR_ENV_FILE", ".env.production")
        self.remote = env("HR_GIT_REMOTE", "origin")
        self.health_url = env("HR_HEALTH_URL", "http://127.0.0.1:3000/health-rider/api/version")
        self.health_timeout = int(env("HR_HEALTH_TIMEOUT", "300"))
        self.fetch_interval = int(env("HR_FETCH_INTERVAL", "600"))
        self.backup = env("HR_BACKUP", "required")  # required | off
        self.backup_dir = env("HR_BACKUP_DIR", "/var/backups/health-rider")
        self.backup_keep = int(env("HR_BACKUP_KEEP", "14"))
        # The web container runs as uid 1001 (user nextjs) with no useful group, so the folder is
        # owned by that uid. HR_WEB_GID only sets the folder's group; root needs no permission bits.
        self.web_uid = int(env("HR_WEB_UID", "1001"))
        self.web_gid = int(env("HR_WEB_GID", "0"))
        self.docker = env("HR_DOCKER", "docker")


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def log(message: str) -> None:
    print(message, flush=True)


def version_key(version: str) -> tuple[int, int, int]:
    major, minor, patch = (int(part) for part in version.split("."))
    return (major, minor, patch)


# ---------------------------------------------------------------- git

def git(cfg: Config, *args: str, check: bool = True, timeout: int = 120) -> str:
    # safe.directory: the checkout belongs to another user and this runs as root.
    result = subprocess.run(
        ["git", "-c", f"safe.directory={cfg.repo}", "-C", cfg.repo, *args],
        capture_output=True, text=True, timeout=timeout,
    )
    if check and result.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)}: {(result.stderr or result.stdout).strip()[:300]}")
    return result.stdout.strip()


def release_tags(cfg: Config) -> dict[str, str]:
    """version -> tag, for tags shaped like v1.2.3."""
    tags = {}
    for line in git(cfg, "tag", "--list", "v*").splitlines():
        match = TAG.match(line.strip())
        if match:
            tags[match.group(1)] = line.strip()
    return tags


def deployed(cfg: Config) -> tuple[str | None, str]:
    """(version, ref) of the checkout the containers were built from."""
    exact = git(cfg, "tag", "--points-at", "HEAD", check=False).splitlines()
    versions = sorted((TAG.match(tag).group(1) for tag in exact if TAG.match(tag)), key=version_key)
    sha = git(cfg, "rev-parse", "--short", "HEAD")
    if versions:
        return versions[-1], f"v{versions[-1]}"
    branch = git(cfg, "rev-parse", "--abbrev-ref", "HEAD", check=False) or "HEAD"
    version = None
    try:
        with open(os.path.join(cfg.repo, MANIFEST_PATH), encoding="utf-8") as handle:
            version = parse_manifest(json.load(handle))["releases"][0]["version"]
    except (OSError, ValueError, KeyError, IndexError):
        pass
    return version, f"{branch}@{sha}"


# ---------------------------------------------------------------- manifest

def parse_manifest(document: object) -> dict:
    """Same rules as src/domain/system-update/releases.ts; raises ValueError on the first problem."""
    if not isinstance(document, dict):
        raise ValueError("releases.json must be an object")
    floor = document.get("rollbackFloor")
    if not isinstance(floor, str) or not VERSION.match(floor):
        raise ValueError("rollbackFloor must be a version")
    if version_key(floor) < version_key(HARD_FLOOR):
        raise ValueError(f"rollbackFloor cannot be older than {HARD_FLOOR}")
    entries = document.get("releases")
    if not isinstance(entries, list) or not entries:
        raise ValueError("releases must list at least one version")
    releases, seen = [], set()
    for index, entry in enumerate(entries):
        if not isinstance(entry, dict) or not isinstance(entry.get("version"), str) or not VERSION.match(entry["version"]):
            raise ValueError(f"releases[{index}].version is not a version")
        if entry["version"] in seen:
            raise ValueError(f"version {entry['version']} is listed twice")
        seen.add(entry["version"])
        whats_new = entry.get("whatsNew")
        if not isinstance(entry.get("releasedAt"), str) or not isinstance(entry.get("title"), str) \
                or not isinstance(whats_new, list) or not whats_new or not all(isinstance(line, str) and line.strip() for line in whats_new):
            raise ValueError(f"releases[{index}] needs releasedAt, title and whatsNew")
        releases.append({
            "version": entry["version"], "releasedAt": entry["releasedAt"], "title": entry["title"].strip(),
            "whatsNew": [line.strip() for line in whats_new], "schemaChange": entry.get("schemaChange") is True,
        })
    if floor not in seen:
        raise ValueError(f"rollbackFloor {floor} must be one of the releases")
    releases = [release for release in releases if version_key(release["version"]) >= version_key(floor)]
    releases.sort(key=lambda release: version_key(release["version"]), reverse=True)
    return {"rollbackFloor": floor, "releases": releases}


def installable(cfg: Config, tags: dict[str, str]) -> dict:
    """The newest tag's manifest, limited to versions that have a tag. Empty when there is no usable tag."""
    for version in sorted(tags, key=version_key, reverse=True):
        try:
            manifest = parse_manifest(json.loads(git(cfg, "show", f"{tags[version]}:{MANIFEST_PATH}")))
        except (RuntimeError, ValueError) as error:
            log(f"skipping tag {tags[version]}: {error}")
            continue
        manifest["releases"] = [release for release in manifest["releases"] if release["version"] in tags]
        return manifest
    return {"rollbackFloor": None, "releases": []}


# ---------------------------------------------------------------- state files

def read_json(path: str) -> object:
    try:
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return None


def write_json(path: str, value: object) -> None:
    temporary = f"{path}.{uuid.uuid4().hex}.tmp"
    with open(temporary, "w", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    os.chmod(temporary, 0o644)
    os.replace(temporary, path)


def take_request(cfg: Config) -> dict | None:
    """Moves request.json out of the web app's reach before acting on it, so it is taken only once."""
    source = os.path.join(cfg.state, "request.json")
    taken = os.path.join(cfg.state, "request.taken.json")
    try:
        os.replace(source, taken)
    except FileNotFoundError:
        return None
    request = read_json(taken)
    os.remove(taken)
    return request if isinstance(request, dict) else {"id": uuid.uuid4().hex, "action": "invalid"}


# ---------------------------------------------------------------- jobs

class Updater:
    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        previous = read_json(os.path.join(cfg.state, "status.json"))
        self.status = previous if isinstance(previous, dict) else {}
        self.status.setdefault("history", [])
        self.tags: dict[str, str] = {}

    def save(self) -> None:
        self.status["checkedAt"] = now()
        self.status["history"] = self.status["history"][:HISTORY_LIMIT]
        write_json(os.path.join(self.cfg.state, "status.json"), self.status)

    def refresh(self, force_fetch: bool) -> None:
        last = self.status.get("fetchedAt")
        due = force_fetch or not last or time.time() - parse_time(last) >= self.cfg.fetch_interval
        if due:
            try:
                git(self.cfg, "fetch", "--tags", "--force", "--quiet", self.cfg.remote, timeout=180)
                self.status["fetchedAt"] = now()
                self.status["fetchError"] = None
            except (RuntimeError, subprocess.TimeoutExpired) as error:
                self.status["fetchError"] = str(error)[:300]
        self.tags = release_tags(self.cfg)
        manifest = installable(self.cfg, self.tags)
        self.status["rollbackFloor"] = manifest["rollbackFloor"]
        self.status["releases"] = manifest["releases"]
        self.status["current"], self.status["deployedRef"] = deployed(self.cfg)

    def record(self, job: dict) -> None:
        self.status["job"] = job
        history = [entry for entry in self.status["history"] if entry.get("id") != job["id"]]
        self.status["history"] = [job, *history]
        self.save()

    def step(self, job: dict, text: str) -> None:
        log(f"[{job['id']}] {text}")
        job["step"] = text
        self.record(job)

    def handle(self, request: dict) -> None:
        by = request.get("requestedBy") if isinstance(request.get("requestedBy"), dict) else {}
        job = {
            "id": str(request.get("id") or uuid.uuid4().hex)[:64],
            "action": request.get("action") if request.get("action") in ("update", "rollback", "check") else "update",
            "version": request.get("version") if isinstance(request.get("version"), str) and VERSION.match(request["version"]) else None,
            "from": self.status.get("current"),
            "state": "running", "step": None, "message": None,
            "requestedBy": str(by.get("name") or "")[:120] or None,
            "requestedAt": request.get("requestedAt") if isinstance(request.get("requestedAt"), str) else None,
            "startedAt": now(), "finishedAt": None, "backup": None,
        }
        if job["action"] == "check":
            self.finish(job, "succeeded", f"ตรวจแล้ว พบ {len(self.status['releases'])} เวอร์ชันที่ติดตั้งได้")
            return
        problem = self.refusal(job["version"])
        if problem:
            self.finish(job, "rejected", problem)
            return
        job["action"] = "update" if version_key(job["version"]) > version_key(job["from"]) else "rollback"
        self.change_version(job)

    def refusal(self, version: str | None) -> str | None:
        floor = self.status.get("rollbackFloor") or HARD_FLOOR
        if version_key(floor) < version_key(HARD_FLOOR):
            floor = HARD_FLOOR
        if not version:
            return "คำสั่งไม่ระบุเวอร์ชันที่ถูกต้อง"
        if version_key(version) < version_key(floor):
            return f"ย้อนกลับได้ถึงเวอร์ชัน {floor} เท่านั้น"
        if version not in self.tags or not any(release["version"] == version for release in self.status["releases"]):
            return f"ไม่พบเวอร์ชัน {version} ใน GitHub"
        if not self.status.get("current"):
            return "ไม่ทราบเวอร์ชันที่ใช้อยู่บนเซิร์ฟเวอร์"
        if version == self.status["current"] and self.status.get("deployedRef") == f"v{version}":
            return f"ใช้เวอร์ชัน {version} อยู่แล้ว"
        return None

    def change_version(self, job: dict) -> None:
        cfg = self.cfg
        previous_sha = git(cfg, "rev-parse", "HEAD")
        try:
            if git(cfg, "status", "--porcelain", "--untracked-files=no"):
                raise RuntimeError("มีไฟล์ในโฟลเดอร์ระบบถูกแก้ไขด้วยมือ (git status ไม่สะอาด) แก้ให้เรียบร้อยก่อน")
            if cfg.backup != "off":
                self.step(job, "สำรองฐานข้อมูล")
                job["backup"] = backup_database(cfg, job)
            self.step(job, f"ดึงโค้ดเวอร์ชัน {job['version']}")
            git(cfg, "checkout", "--quiet", "--detach", self.tags[job["version"]])
            self.step(job, "สร้างและเริ่มระบบใหม่ (ใช้เวลาหลายนาที)")
            compose_up(cfg)
            self.step(job, "ตรวจว่าระบบเวอร์ชันใหม่เปิดได้")
            wait_for_release(cfg, job["version"])
        except Exception as error:  # noqa: BLE001 - every failure must end in a rollback attempt and a record
            log(f"[{job['id']}] failed: {error}")
            reason = str(error)[:400]
            try:
                self.step(job, f"กลับไปเวอร์ชันเดิม {job['from']}")
                git(cfg, "checkout", "--quiet", "--force", "--detach", previous_sha)
                compose_up(cfg)
                if job["from"]:
                    wait_for_release(cfg, job["from"])
                self.finish(job, "failed", f"{reason} · กลับไปใช้เวอร์ชัน {job['from']} แล้ว")
            except Exception as revert_error:  # noqa: BLE001
                self.finish(job, "failed", f"{reason} · กลับไปเวอร์ชันเดิมไม่สำเร็จ: {str(revert_error)[:300]} ต้องแก้บนเซิร์ฟเวอร์")
            self.status["current"], self.status["deployedRef"] = deployed(cfg)
            self.save()
            return
        self.status["current"], self.status["deployedRef"] = deployed(cfg)
        verb = "อัปเดต" if job["action"] == "update" else "ย้อนกลับ"
        self.finish(job, "succeeded", f"{verb}เป็นเวอร์ชัน {job['version']} เรียบร้อย")

    def finish(self, job: dict, state: str, message: str) -> None:
        job.update(state=state, message=message, finishedAt=now(), step=None)
        log(f"[{job['id']}] {state}: {message}")
        self.record(job)


def parse_time(value: str) -> float:
    try:
        return dt.datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0.0


# ---------------------------------------------------------------- docker, health and backup

def compose_up(cfg: Config) -> None:
    result = subprocess.run(
        [cfg.docker, "compose", "-f", cfg.compose_file, "--env-file", cfg.env_file, "up", "-d", "--build", "--remove-orphans"],
        cwd=cfg.compose_dir, capture_output=True, text=True, timeout=1800,
    )
    if result.returncode != 0:
        tail = (result.stderr or result.stdout).strip().splitlines()[-6:]
        raise RuntimeError("docker compose up ไม่สำเร็จ: " + " | ".join(tail)[:400])


def wait_for_release(cfg: Config, version: str) -> None:
    deadline = time.time() + cfg.health_timeout
    seen = None
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(cfg.health_url, timeout=10) as response:  # noqa: S310 - fixed local URL from config
                seen = json.load(response).get("release")
            if seen == version:
                return
        except Exception:  # noqa: BLE001 - not up yet
            pass
        time.sleep(3)
    raise RuntimeError(f"ระบบไม่ตอบเป็นเวอร์ชัน {version} ภายใน {cfg.health_timeout} วินาที (ได้ {seen or 'ไม่มีคำตอบ'})")


def read_env_file(path: str) -> dict[str, str]:
    values = {}
    try:
        with open(path, encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                value = value.strip()
                if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
                    value = value[1:-1]
                values[key.strip()] = value
    except OSError:
        pass
    return values


def backup_database(cfg: Config, job: dict) -> str:
    """Dumps the app database to a gzip file and keeps the newest HR_BACKUP_KEEP of them."""
    url = read_env_file(os.path.join(cfg.compose_dir, cfg.env_file)).get("DATABASE_URL", "")
    parsed = urllib.parse.urlparse(url)
    database = urllib.parse.unquote(parsed.path.lstrip("/"))
    if parsed.scheme not in ("mysql", "mariadb") or not parsed.hostname or not database:
        raise RuntimeError("อ่าน DATABASE_URL จาก .env.production ไม่ได้ จึงสำรองฐานข้อมูลไม่ได้")
    dump = shutil.which("mariadb-dump") or shutil.which("mysqldump")
    if not dump:
        raise RuntimeError("ไม่พบ mariadb-dump หรือ mysqldump บนเซิร์ฟเวอร์ ติดตั้ง mariadb-client ก่อน")
    os.makedirs(cfg.backup_dir, mode=0o700, exist_ok=True)
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    target = os.path.join(cfg.backup_dir, f"health-rider-{job['from'] or 'unknown'}-to-{job['version']}-{stamp}.sql.gz")
    command = [dump, "--single-transaction", "--routines", "--triggers", "--default-character-set=utf8mb4",
               "-h", parsed.hostname, "-P", str(parsed.port or 3306), "-u", urllib.parse.unquote(parsed.username or ""), database]
    # The password goes through the environment so it never shows in the process list.
    environment = {**os.environ, "MYSQL_PWD": urllib.parse.unquote(parsed.password or "")}
    with gzip.open(target, "wb") as output:
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=environment)
        assert process.stdout is not None
        shutil.copyfileobj(process.stdout, output)
        _, error = process.communicate(timeout=1800)
    if process.returncode != 0:
        os.remove(target)
        raise RuntimeError("สำรองฐานข้อมูลไม่สำเร็จ: " + error.decode("utf-8", "replace").strip()[:300])
    os.chmod(target, 0o600)
    backups = sorted(
        (os.path.join(cfg.backup_dir, name) for name in os.listdir(cfg.backup_dir) if name.startswith("health-rider-") and name.endswith(".sql.gz")),
        key=os.path.getmtime, reverse=True,
    )
    for old in backups[cfg.backup_keep:]:
        os.remove(old)
    return target


# ---------------------------------------------------------------- main

def prepare_state_dir(cfg: Config) -> None:
    # The web container's user (uid 1001) owns it so it can add request.json; root reads and writes
    # anything regardless. status.json stays root-owned and world-readable. Set by install.sh too.
    os.makedirs(cfg.state, exist_ok=True)
    if os.geteuid() == 0:
        os.chown(cfg.state, cfg.web_uid, cfg.web_gid)
        os.chmod(cfg.state, 0o770)


def main() -> int:
    cfg = Config()
    prepare_state_dir(cfg)
    with open(os.path.join(cfg.state, ".lock"), "w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            log("another run is still working")
            return 0
        updater = Updater(cfg)
        running = updater.status.get("job")
        if isinstance(running, dict) and running.get("state") == "running":
            # The previous run died mid-job (power cut, reboot); say so instead of showing it as running forever.
            running.update(state="failed", message="งานถูกขัดจังหวะ (เซิร์ฟเวอร์รีสตาร์ตหรือสคริปต์หยุด) ตรวจเวอร์ชันที่ใช้อยู่ด้านบน", finishedAt=now(), step=None)
            updater.record(running)
        request = take_request(cfg)
        try:
            updater.refresh(force_fetch=request is not None)
        except Exception as error:  # noqa: BLE001
            updater.status["fetchError"] = str(error)[:300]
        updater.save()
        if request is not None:
            updater.handle(request)
    return 0


if __name__ == "__main__":
    sys.exit(main())
