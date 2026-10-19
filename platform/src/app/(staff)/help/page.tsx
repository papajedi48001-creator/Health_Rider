import { Fragment } from 'react';
import { getSessionFromCookies } from '@/auth/current-session';
import { Icon } from '@/brand/icons';
import { Mascot } from '@/brand/mascot';
import { manual, manualFor, manualUpdated, type ManualBlock } from '@/help/manual';
import { withBasePath } from '@/lib/base-path';
import { roleLabels } from '@/lib/labels';

// **words** in the manual text mark button and menu names.
function Rich({ text }: { text: string }) {
  return <>{text.split('**').map((part, index) => (index % 2 === 1 ? <b key={index} className="manual-ui">{part}</b> : <Fragment key={index}>{part}</Fragment>))}</>;
}

function Block({ block }: { block: ManualBlock }) {
  switch (block.kind) {
    case 'p': return <p><Rich text={block.text} /></p>;
    case 'note': return <div className="manual-note"><strong>ข้อควรรู้</strong><p><Rich text={block.text} /></p></div>;
    case 'steps': return <ol className="manual-steps">{block.items.map((item) => <li key={item}><Rich text={item} /></li>)}</ol>;
    case 'list': return <ul className="manual-bullets">{block.items.map((item) => <li key={item}><Rich text={item} /></li>)}</ul>;
    case 'table': return (
      <table className="manual-table">
        <thead><tr>{block.head.map((cell) => <th key={cell}>{cell}</th>)}</tr></thead>
        <tbody>{block.rows.map((row) => <tr key={row[0]}>{row.map((cell, index) => <td key={index}><Rich text={cell} /></td>)}</tr>)}</tbody>
      </table>
    );
  }
}

// Chapters keep their numbers from the PDF, while the signed-in role's chapters are listed first.
const chapterNumber = (id: string) => String(manual.findIndex((section) => section.id === id) + 1).padStart(2, '0');

export default async function HelpPage() {
  const session = await getSessionFromCookies();
  const sections = session ? manualFor(session.role) : manual;

  return (
    <main className="manual">
      <header className="manual-cover">
        <div>
          <span className="manual-kicker">ระบบส่งยาถึงบ้าน · ปรับปรุง {manualUpdated}</span>
          <h1>คู่มือการใช้งาน Health Rider</h1>
          <p>สำหรับเภสัชกรรม ไรเดอร์ ผู้ประสานงาน และผู้ดูแลระบบ หัวข้อของบทบาทคุณอยู่ด้านบน</p>
          <a className="btn manual-download" href={withBasePath('/manual/health-rider-user-manual.pdf')} download>
            <Icon name="download" /> ดาวน์โหลดคู่มือ PDF
          </a>
        </div>
        <Mascot width={150} variant="small" />
      </header>
      <nav aria-label="สารบัญคู่มือ" className="manual-toc">
        <ol>
          {sections.map((section) => (
            <li key={section.id}><a href={`#${section.id}`}><span>{chapterNumber(section.id)}</span>{section.title}</a></li>
          ))}
        </ol>
      </nav>
      {sections.map((section) => (
        <section key={section.id} id={section.id} className="manual-section">
          <div className="manual-chapter">
            <span className="manual-number">{chapterNumber(section.id)}</span>
            <div>
              <h2>{section.title}</h2>
              {section.roles && <div className="manual-roles">{section.roles.map((role) => <span key={role}>{roleLabels[role]}</span>)}</div>}
            </div>
          </div>
          {section.blocks.map((block, index) => <Block key={index} block={block} />)}
          {section.parts?.map((part, index) => (
            <Fragment key={part.title}>
              <h3><span>{Number(chapterNumber(section.id))}.{index + 1}</span>{part.title}</h3>
              {part.blocks.map((block, blockIndex) => <Block key={blockIndex} block={block} />)}
            </Fragment>
          ))}
        </section>
      ))}
    </main>
  );
}
