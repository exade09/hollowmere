'use client';

import { useCallback, useEffect, useState } from 'react';
import AudioBed from '@/components/AudioBed';
import Chrome from '@/components/Chrome';
import Stage from '@/components/Stage';
import PanelHost from '@/components/panels';
import { BRAND } from '@/lib/content';
import { Save, openSession, read } from '@/lib/save';
import { PanelId, SCENES, SceneId, Zone } from '@/lib/scenes';

export default function Home() {
  const [scene, setScene] = useState<SceneId>('sanctum');
  const [panel, setPanel] = useState<PanelId | null>(null);
  // The zone that opened the panel: its clip stays on screen underneath, so a
  // widget never drops the room back to idle.
  const [lockedZone, setLockedZone] = useState<Zone | null>(null);
  const [save, setSave] = useState<Save | null>(null);
  const [booted, setBooted] = useState(false);

  // The session opens on the client only: the save lives in localStorage.
  useEffect(() => {
    setSave(openSession());
  }, []);

  const refresh = useCallback(() => setSave(read()), []);

  // Time is banked once a minute so storage is not hammered.
  useEffect(() => {
    const t = setInterval(() => {
      const s = read();
      s.playSec += 60;
      window.localStorage.setItem('hollowmere.save', JSON.stringify(s));
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  const onZone = useCallback((z: Zone) => {
    if (z.action.kind === 'travel') {
      setPanel(null);
      setLockedZone(null);
      setScene(z.action.to);
    } else {
      setLockedZone(z);
      setPanel(z.action.id);
    }
  }, []);

  const travel = useCallback((to: SceneId) => {
    setPanel(null);
    setLockedZone(null);
    setScene(to);
  }, []);

  return (
    <main>
      <Stage scene={SCENES[scene]} onZone={onZone} locked={panel ? lockedZone : null} />

      {save && <AudioBed save={save} started={booted} />}

      {save && (
        <Chrome
          scene={scene}
          save={save}
          onMap={() => setPanel('map')}
          onSigil={() => setPanel('sigil')}
          refresh={refresh}
        />
      )}

      {panel && save && (
        <PanelHost
          id={panel}
          save={save}
          refresh={refresh}
          onClose={() => { setPanel(null); setLockedZone(null); refresh(); }}
          onTravel={travel}
        />
      )}

      <div
        className={`boot ${booted ? 'gone' : ''}`}
        onClick={() => setBooted(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setBooted(true); }}
        aria-label="enter"
      >
        <div>
          <h1>{BRAND.world}</h1>
          <p>{BRAND.hero}</p>
          <div className="hint">click to enter</div>
        </div>
      </div>
    </main>
  );
}
