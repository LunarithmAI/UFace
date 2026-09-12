"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ShieldCheck } from "lucide-react";
import type { Goal, Profile } from "../lib/contracts";
import styles from "./app.module.css";
export const goalLabels: Record<Goal, string> = {
  hair: "Hair & hairstyle",
  skin: "Skin-care routine",
  "facial-hair": "Facial hair",
  presentation: "Photo presentation",
};
export default function Onboarding({
  initial,
  onComplete,
  onCancel,
}: {
  initial?: Profile | null;
  onComplete: (profile: Profile) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState(0),
    [adult, setAdult] = useState(false),
    [goals, setGoals] = useState<Goal[]>(initial?.goals ?? []),
    [minutes, setMinutes] = useState<Profile["dailyMinutes"] | null>(
      initial?.dailyMinutes ?? null,
    ),
    [budget, setBudget] = useState<Profile["budget"] | null>(
      initial?.budget ?? null,
    ),
    [experience, setExperience] = useState<Profile["experience"] | null>(
      initial?.experience ?? null,
    );
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  const titles = [
    "A little care, from the start.",
    "What would you like to focus on?",
    "Make it fit your day.",
    "Your starting point.",
  ];
  const valid = [adult, goals.length > 0, !!minutes && !!budget, !!experience][
    step
  ];
  return (
    <section className={styles.onboarding}>
      <div className="row">
        <button
          className="button secondary"
          onClick={() => (step ? setStep(step - 1) : onCancel())}
        >
          <ArrowLeft size={18} /> Back
        </button>
        <span className="muted">Step {step + 1} of 4</span>
      </div>
      <div className={styles.steps} aria-hidden="true">
        {titles.map((_, i) => (
          <span key={i} data-active={i <= step} />
        ))}
      </div>
      <p className="eyebrow">YOUR ROUTINE, YOUR TERMS</p>
      <h1 tabIndex={-1} ref={heading}>
        {titles[step]}
      </h1>
      {step === 0 && (
        <div className="stack">
          <ShieldCheck size={40} />
          <p>
            UFace checks face landmarks on your device, then—with separate
            permission—sends your normalized photo and answers to Google Gemini
            for personalized grooming ideas.
          </p>
          <p className="muted">
            History stays in this browser. Photos are saved here only if you
            choose. There are no beauty scores, diagnoses, or promised outcomes.
          </p>
          <label className={styles.option}>
            <input
              type="checkbox"
              checked={adult}
              onChange={(e) => setAdult(e.target.checked)}
            />
            <span>I am 18 or older and will only use my own photos.</span>
          </label>
          <a href="/privacy">Read how your data is used</a>
        </div>
      )}
      {step === 1 && (
        <div className="stack">
          <p className="muted">
            Choose one or more. We’ll focus your advice on what matters to you.
          </p>
          {(Object.keys(goalLabels) as Goal[]).map((goal) => (
            <label
              key={goal}
              className={styles.option}
              data-selected={goals.includes(goal)}
            >
              <input
                type="checkbox"
                checked={goals.includes(goal)}
                onChange={() =>
                  setGoals((prev) =>
                    prev.includes(goal)
                      ? prev.filter((g) => g !== goal)
                      : [...prev, goal],
                  )
                }
              />
              {goalLabels[goal]}
            </label>
          ))}
        </div>
      )}
      {step === 2 && (
        <div className="stack">
          <fieldset>
            <legend>Daily time</legend>
            <div className={styles.choices}>
              {([5, 10, 20] as const).map((n) => (
                <label
                  className={styles.option}
                  key={n}
                  data-selected={minutes === n}
                >
                  <input
                    type="radio"
                    name="minutes"
                    checked={minutes === n}
                    onChange={() => setMinutes(n)}
                  />
                  {n} minutes
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Budget</legend>
            <div className="stack">
              {(["minimal", "moderate", "flexible"] as const).map((b) => (
                <label
                  className={styles.option}
                  key={b}
                  data-selected={budget === b}
                >
                  <input
                    type="radio"
                    name="budget"
                    checked={budget === b}
                    onChange={() => setBudget(b)}
                  />
                  <span>{b[0].toUpperCase() + b.slice(1)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      )}
      {step === 3 && (
        <div className="stack">
          <fieldset>
            <legend>How familiar are you with a grooming routine?</legend>
            {(["starting", "established"] as const).map((e) => (
              <label
                key={e}
                className={styles.option}
                data-selected={experience === e}
              >
                <input
                  type="radio"
                  name="experience"
                  checked={experience === e}
                  onChange={() => setExperience(e)}
                />
                {e === "starting"
                  ? "I’m getting started"
                  : "I have an established routine"}
              </label>
            ))}
          </fieldset>
          <div className="card">
            <p className="eyebrow">YOUR PLAN BRIEF</p>
            <p>{goals.map((g) => goalLabels[g]).join(" · ")}</p>
            <p className="muted">
              {minutes} minutes a day · {budget} budget
            </p>
            <p>
              Your next step is a guided frontal photo. Nothing is uploaded
              until you explicitly consent.
            </p>
          </div>
        </div>
      )}
      <button
        className="button"
        disabled={!valid}
        onClick={() => {
          if (step < 3) setStep(step + 1);
          else if (minutes && budget && experience)
            onComplete({
              version: 1,
              adultConfirmed: true,
              goals,
              dailyMinutes: minutes,
              budget,
              experience,
            });
        }}
      >
        {step === 3 ? (
          <>
            <Check size={18} /> {initial ? "Save profile" : "Create my plan"}
          </>
        ) : (
          <>
            Continue <ArrowRight size={18} />
          </>
        )}
      </button>
    </section>
  );
}
