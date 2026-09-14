'use client';

/**
 * What a reading makes possible, on screen.
 *
 * Three blocks, in the order somebody actually wants them: what the contract
 * is, how the position could be taken away, and the three figures that would
 * tell them it has changed. No score, no colour-coded verdict, no traffic
 * light — the weight of a line is shown by whether it is a mechanism of total
 * loss or something to know, which is a property of the fact rather than a
 * grade of the token. lib/agent/assess.ts argues that line; this file only has
 * to avoid undoing it in CSS.
 */

export type Flag = { id: string; text: string; weight: 'hard' | 'note' };
export type Threshold = { name: string; now: string; means: string };
export type TokenAssessment = {
  shape: string;
  flags: Flag[];
  thresholds: Threshold[];
  mechanisms: Flag[];
};

export default function Assessment({
  title,
  assessment,
}: {
  title?: string;
  assessment: TokenAssessment;
}) {
  const { shape, flags, thresholds, mechanisms } = assessment;
  const hard = flags.filter((f) => f.weight === 'hard');
  const notes = flags.filter((f) => f.weight === 'note');

  return (
    <section className="assay">
      {title && <h4 className="assay-name">{title}</h4>}
      <p className="assay-shape">{shape}</p>

      {(hard.length > 0 || notes.length > 0) && (
        <ul className="assay-flags">
          {[...hard, ...notes].map((f) => (
            <li key={f.id} className={f.weight}>
              {f.text}
            </li>
          ))}
        </ul>
      )}

      {mechanisms.length > 0 && (
        <>
          <div className="label-sm">how it could be taken</div>
          <ul className="assay-flags">
            {mechanisms.map((m) => (
              <li key={m.id} className={m.weight}>
                {m.text}
              </li>
            ))}
          </ul>
        </>
      )}

      {thresholds.length > 0 && (
        <>
          <div className="label-sm">three things that would change it</div>
          <ol className="assay-thresholds">
            {thresholds.map((t) => (
              <li key={t.name}>
                <div className="assay-th-head">
                  <b>{t.name}</b>
                  <span className="mono">{t.now}</span>
                </div>
                <p>{t.means}</p>
              </li>
            ))}
          </ol>
          <p className="assay-line">
            these are not prices and not predictions. they are three figures standing where
            they stand today, and each one can be read again tomorrow.
          </p>
        </>
      )}
    </section>
  );
}
