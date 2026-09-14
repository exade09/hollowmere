import { XMark } from '@/components/icons';
import { ACCOUNT, BRAND } from '@/lib/content';

export default function ComingSoon() {
  return (
    <main className={'coming-soon'}>
      <div className={'coming-soon-glow'} aria-hidden />

      <section className={'coming-soon-card'} aria-labelledby={'coming-soon-title'}>
        <div className={'coming-soon-logo-frame'}>
          <img
            className={'coming-soon-logo'}
            src={'/icon.jpg'}
            alt={`${BRAND.world} logo`}
            width={180}
            height={180}
          />
        </div>

        <p className={'coming-soon-kicker'}>the gate remains closed</p>
        <h1 id={'coming-soon-title'}>{BRAND.world}</h1>
        <p className={'coming-soon-copy'}>the project has not launched yet</p>
        <p className={'coming-soon-word'}>soon</p>
        <p className={'coming-soon-follow'}>follow the updates</p>

        <a
          className={'coming-soon-x'}
          href={`https://x.com/${ACCOUNT}`}
          target={'_blank'}
          rel={'noreferrer'}
          aria-label={`follow ${BRAND.world} on X`}
        >
          <XMark size={17} />
          <span>@{ACCOUNT}</span>
        </a>
      </section>
    </main>
  );
}
