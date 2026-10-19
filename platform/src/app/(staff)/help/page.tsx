import { Fragment } from 'react';
import { getSessionFromCookies } from '@/auth/current-session';
import { manual, manualFor, manualUpdated, type ManualBlock } from '@/help/manual';

// **words** in the manual text mark button and menu names.
function Rich({ text }: { text: string }) {
  return <>{text.split('**').map((part, index) => (index % 2 === 1 ? <strong key={index}>{part}</strong> : <Fragment key={index}>{part}</Fragment>))}</>;
}

function Block({ block }: { block: ManualBlock }) {
  switch (block.kind) {
    case 'p': return <p><Rich text={block.text} /></p>;
    case 'note': return <p className="manual-note"><Rich text={block.text} /></p>;
    case 'steps': return <ol>{block.items.map((item) => <li key={item}><Rich text={item} /></li>)}</ol>;
    case 'list': return <ul>{block.items.map((item) => <li key={item}><Rich text={item} /></li>)}</ul>;
    case 'table': return (
      <table>
        <thead><tr>{block.head.map((cell) => <th key={cell}>{cell}</th>)}</tr></thead>
        <tbody>{block.rows.map((row) => <tr key={row[0]}>{row.map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}</tbody>
      </table>
    );
  }
}

export default async function HelpPage() {
  const session = await getSessionFromCookies();
  const sections = session ? manualFor(session.role) : manual;

  return (
    <main className="manual">
      <h1>คู่มือการใช้งาน</h1>
      <p>วิธีใช้ Health Rider สำหรับเภสัชกรรม ไรเดอร์ ผู้ประสานงาน และผู้ดูแลระบบ หัวข้อของบทบาทคุณอยู่ด้านบน · ปรับปรุงล่าสุด {manualUpdated}</p>
      <nav aria-label="สารบัญคู่มือ" className="manual-toc">
        <ol>{sections.map((section) => <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>)}</ol>
      </nav>
      {sections.map((section) => (
        <section key={section.id} id={section.id} className="manual-section">
          <h2>{section.title}</h2>
          {section.blocks.map((block, index) => <Block key={index} block={block} />)}
          {section.parts?.map((part) => (
            <Fragment key={part.title}>
              <h3>{part.title}</h3>
              {part.blocks.map((block, index) => <Block key={index} block={block} />)}
            </Fragment>
          ))}
        </section>
      ))}
    </main>
  );
}
