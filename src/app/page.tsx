import { ArrowUpRight, ScanFace, Fingerprint, ArrowRight } from "lucide-react";
export default function Welcome() {
  return (
    <main className="welcome">
      <header className="welcome-header">
        <a href="/" className="brand" aria-label="UFace home">
          <img src="/uface-mark.svg" alt="" width="32" height="32" />
          uface<span className="brand-dot">®</span>
        </a>
        <a href="/app" className="open-link">
          Open UFace <ArrowUpRight size={17} />
        </a>
      </header>
      <section className="welcome-body">
        <div className="eyebrow">
          <span className="blue-dash" /> A LITTLE MORE YOU
        </div>
        <h1>
          Your face.
          <br />
          <span>Your potential.</span>
        </h1>
        <p className="welcome-description">
          Understand your features.
          <br />
          Find a routine that feels like you.
        </p>
        <div className="portrait-study">
          <img
            src="/face-study.svg"
            alt="Original illustrated face study with a facial measurement mesh"
          />
          <span className="study-label">
            <ScanFace size={15} /> A NEW PERSPECTIVE
          </span>
          <span className="study-index">01 — YOU</span>
        </div>
        <div className="welcome-details">
          <div>
            <span className="detail-number">01</span>
            <span>
              Understand
              <br />
              <strong>Your features</strong>
            </span>
          </div>
          <div>
            <span className="detail-number">02</span>
            <span>
              Build
              <br />
              <strong>Your routine</strong>
            </span>
          </div>
          <div>
            <span className="detail-number">03</span>
            <span>
              Keep track
              <br />
              <strong>Your progress</strong>
            </span>
          </div>
        </div>
        <a className="button welcome-cta" href="/quiz">
          Let’s find your routine <ArrowRight size={20} />
        </a>
        <p className="privacy-note">
          <Fingerprint size={15} /> Your photo. Your choice. No beauty scores.
        </p>
      </section>
      <footer className="welcome-footer">
        <span>PERSONAL GROWTH, NOT PERFECTION.</span>
        <div>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <span>18+</span>
        </div>
      </footer>
    </main>
  );
}
