---
version: alpha
colors:
  primary: "#0F766E"
  ink: "#17313A"
  canvas: "#F5F8F7"
  surface: "#FFFFFF"
  care: "#0F766E"
  warning: "#B45309"
  danger: "#B42318"
typography:
  body:
    fontFamily: "Tahoma, 'Noto Sans Thai', system-ui, sans-serif"
  utility:
    fontFamily: "ui-monospace, 'Cascadia Code', monospace"
rounded:
  control: "8px"
  surface: "12px"
spacing:
  page: "24px"
components:
  status:
    backgroundColor: "#FFFFFF"
    textColor: "#17313A"
    rounded: "12px"
---

## Overview

Health Rider is a Thai-first operational product for pharmacy and riders working around a hospital and patient homes. Its visual reference is a laminated medication-delivery checklist: calm, legible, and direct in sunlight on a mobile device. The signature is a clear status strip that always states whether work is stored locally, syncing, or confirmed.

## Colors

`care` is reserved for confirmed, safe progress; warning is for recoverable offline work; danger is for work that needs intervention. Patient data is not used as decorative content.

## Typography

Use the Thai-capable system stack at a comfortable body size. Use utility type only for identifiers such as HN or an event UUID.

## Layout

Rider routes are single-column, mobile-first flows. Primary actions stay in document flow and remain reachable on narrow screens. Do not imply a completed delivery until the server acknowledgement exists.

## Elevation & Depth

Use restrained borders and surface contrast rather than dramatic shadows.

## Shapes

Controls use the control radius and sections use the surface radius. Status does not rely on color alone.

## Components

Status messages are live regions with concrete recovery guidance. Buttons retain their size while busy and use native semantics.

## Do's and Don'ts

Do show local/offline state explicitly. Do keep evidence out of list previews. Do not cache rider API responses. Do not use generic success copy when sync remains pending.
