import Link from "next/link";

import HomeBoardPreview from "./home-board-preview";

export default function Home() {
  return (
    <main className="home-shell">
      <header className="home-header">
        <div>
          <p className="eyebrow">Private online board game</p>
          <h1>Tock</h1>
        </div>
        <nav className="home-actions" aria-label="Online game actions">
          <Link className="quiet-button" href="/create">Create Game</Link>
          <Link className="home-primary" href="/join">Join Game</Link>
        </nav>
      </header>

      <section className="home-hero">
        <div className="home-copy">
          <p className="eyebrow">Race home together—or alone</p>
          <h2>Cards choose the distance. You choose the move.</h2>
          <p>Create a private table for two to four players, share its four-digit code, and play live from any browser.</p>
        </div>
        <div className="home-board-preview" aria-label="Preview of a four-player Tock board">
          <HomeBoardPreview />
        </div>
      </section>
    </main>
  );
}
