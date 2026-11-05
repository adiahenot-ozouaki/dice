import { createFileRoute } from "@tanstack/react-router";
import { RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ComponentType, type PointerEvent } from "react";
import { playLand, playRattle, setMuted, unlockAudio } from "@/lib/dice-audio";
import type { Face } from "@/lib/faces";
import { loadRolls, saveRolls } from "@/lib/roll-history";

export const Route = createFileRoute("/")({ component: Home });

type StageProps = {
  target: Face | null;
  spinId: number;
  impulse: number;
  onSettled: (top: Face) => void;
  onReady: () => void;
};

function rollD6(): Face {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return ((buf[0]! % 6) + 1) as Face;
}

const FACE_LABELS: Face[] = [1, 2, 3, 4, 5, 6];

function Home() {
  const [Stage, setStage] = useState<ComponentType<StageProps> | null>(null);
  const [ready, setReady] = useState(false);
  const [spinId, setSpinId] = useState(0);
  const [target, setTarget] = useState<Face | null>(null);
  const [shown, setShown] = useState<Face | null>(null);
  const [rolling, setRolling] = useState(false);
  const [rolls, setRolls] = useState<number[]>([]);
  const [muted, setMutedState] = useState(false);
  const [impulse, setImpulse] = useState(0);
  const rollingRef = useRef(false);
  const readyRef = useRef(false);
  const targetRef = useRef<Face | null>(null);

  useEffect(() => {
    let alive = true;
    void import("@/components/dice-stage").then((m) => {
      if (alive) setStage(() => m.DiceStage);
    });
    setRolls(loadRolls());
    const savedMute = localStorage.getItem("ivoire-muted") === "1";
    setMutedState(savedMute);
    setMuted(savedMute);
    const onVis = () => {
      if (document.visibilityState === "visible") unlockAudio();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const roll = useCallback(() => {
    if (!readyRef.current || rollingRef.current) return;
    unlockAudio();
    const value = rollD6();
    rollingRef.current = true;
    targetRef.current = value;
    setTarget(value);
    setRolling(true);
    setSpinId((n) => n + 1);
    playRattle();
  }, []);

  const onSettled = useCallback((top: Face) => {
    const expected = targetRef.current;
    const face = expected ?? top;
    if (expected != null && top !== expected) {
      console.error("Dice settled on", top, "expected", expected);
    }
    setShown(face);
    setRolling(false);
    rollingRef.current = false;
    setImpulse((n) => n + 1);
    setRolls((prev) => {
      const next = [face, ...prev].slice(0, 24);
      saveRolls(next);
      return next;
    });
    playLand();
    const w = window as Window & { __face?: number; __top?: number };
    w.__face = face;
    w.__top = top;
  }, []);

  const onReady = useCallback(() => {
    readyRef.current = true;
    setReady(true);
  }, []);

  useEffect(() => {
    const w = window as Window & { __roll?: () => void; __ready?: boolean };
    w.__roll = () => roll();
    w.__ready = ready;
    return () => {
      delete w.__roll;
    };
  }, [roll, ready]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code !== "Space" && e.code !== "Enter") return;
      const el = e.target as HTMLElement | null;
      if (el?.closest("[data-no-roll]")) return;
      e.preventDefault();
      roll();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [roll]);

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    const el = e.target as HTMLElement;
    if (el.closest("[data-no-roll]")) return;
    roll();
  };

  const toggleMute = () => {
    unlockAudio();
    setMutedState((m) => {
      const next = !m;
      setMuted(next);
      localStorage.setItem("ivoire-muted", next ? "1" : "0");
      return next;
    });
  };

  const clearHistory = () => {
    setRolls([]);
    saveRolls([]);
  };

  const counts = FACE_LABELS.map((n) => rolls.filter((r) => r === n).length);
  const caption = !ready
    ? "Le dé se pose…"
    : rolling
      ? "En l'air"
      : shown == null
        ? "Un clic, un lancer"
        : "Résultat";

  return (
    <main className="die-app relative h-dvh overflow-hidden bg-bg text-fg" onPointerDown={onPointerDown}>
      <div className="absolute inset-0">
        {Stage ? (
          <Stage
            target={target}
            spinId={spinId}
            impulse={impulse}
            onSettled={onSettled}
            onReady={onReady}
          />
        ) : null}
      </div>
      <div className="vignette pointer-events-none absolute inset-0" />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between px-5 pt-5 sm:px-8 sm:pt-7">
        <div>
          <p className="font-display text-2xl leading-none font-medium tracking-tight text-fg">Ivoire</p>
          <p className="mt-1 text-sm text-muted">Dé à six faces</p>
        </div>
        <button
          type="button"
          data-no-roll
          onClick={toggleMute}
          aria-label={muted ? "Activer le son" : "Couper le son"}
          aria-pressed={muted}
          className="pointer-events-auto grid size-11 place-items-center rounded-full border border-line bg-surface text-fg transition-transform duration-150 ease-out active:scale-[0.96]"
        >
          {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
        </button>
      </header>

      <div className="dock pointer-events-none absolute inset-x-0 bottom-0 z-10">
        <div className="dock-pad mx-auto flex w-full max-w-md flex-col items-center gap-4 px-5 pt-16">
          <div aria-live="polite" className="flex flex-col items-center">
            <p
              key={rolls.length}
              className="result-pop font-display text-7xl leading-none font-medium tabular-nums text-fg"
            >
              {shown ?? "–"}
            </p>
            <p className="mt-2 text-sm tracking-wide text-muted">{caption}</p>
          </div>

          <button
            type="button"
            className="pointer-events-auto h-12 min-w-40 rounded-full bg-gold px-8 text-base font-semibold text-ink transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-60"
            disabled={!ready || rolling}
          >
            Lancer
          </button>

          <div className="grid w-full grid-cols-6 gap-2">
            {FACE_LABELS.map((n, i) => (
              <div
                key={n}
                className="flex flex-col items-center rounded-xl border border-line bg-surface py-2"
              >
                <span
                  className={
                    "font-display text-lg leading-none " + (rolls[0] === n ? "text-gold" : "text-fg")
                  }
                >
                  {n}
                </span>
                <span className="mt-1 text-xs text-muted tabular-nums">{counts[i]}</span>
              </div>
            ))}
          </div>

          <div className="flex h-11 w-full items-center justify-center gap-2">
            {rolls.length > 0 ? (
              <ol className="flex gap-1.5">
                {rolls.slice(0, 8).map((n, i) => (
                  <li
                    key={`${rolls.length}-${i}`}
                    className={
                      "grid size-8 place-items-center rounded-lg border font-display text-sm tabular-nums " +
                      (i === 0
                        ? "border-gold bg-surface text-gold"
                        : "border-line bg-bg text-fg")
                    }
                  >
                    {n}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-muted">Les faces s’équilibrent au fil des lancers.</p>
            )}
            {rolls.length > 0 ? (
              <button
                type="button"
                data-no-roll
                onClick={clearHistory}
                aria-label="Effacer l'historique"
                className="pointer-events-auto grid size-11 place-items-center rounded-full text-muted transition-transform duration-150 ease-out active:scale-[0.96]"
              >
                <RotateCcw className="size-4" />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
