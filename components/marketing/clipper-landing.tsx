"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { CSSProperties } from "react";
import "./clipper-landing.css";

// Inline style helper for the timeline tick heights (--h CSS custom property).
const h = (value: string): CSSProperties => ({ ["--h"]: value } as CSSProperties);

export function ClipperLanding() {
  const navRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const nav = navRef.current;
    const root = rootRef.current;

    // Nav border-on-scroll.
    const onScroll = () => {
      if (!nav) return;
      nav.classList.toggle("scrolled", window.scrollY > 10);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    // Scroll reveal — respect prefers-reduced-motion (reveal immediately, no observer).
    const reveals = root ? Array.from(root.querySelectorAll<HTMLElement>(".rv")) : [];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let io: IntersectionObserver | undefined;
    if (reduced) {
      reveals.forEach((el) => el.classList.add("in"));
    } else {
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add("in");
              io?.unobserve(e.target);
            }
          });
        },
        { threshold: 0.12 }
      );
      reveals.forEach((el) => io!.observe(el));
    }

    return () => {
      window.removeEventListener("scroll", onScroll);
      io?.disconnect();
    };
  }, []);

  return (
    <div className="clp" ref={rootRef}>
      <nav ref={navRef}>
        <div className="wrap nav-in">
          <Link href="/" className="brand">
            <span className="mark" />
            Gyrom
          </Link>
          <div className="nav-links">
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </div>
          <Link href="/signup" className="btn btn-primary">
            Start free
          </Link>
        </div>
      </nav>

      <header className="wrap hero">
        <div>
          <span className="eyebrow">AI video clipper</span>
          <h1>
            Find the clips hiding in your <span className="hl">long videos</span>.
          </h1>
          <p className="lede">
            Drop in a podcast, interview, or stream. Gyrom finds the moments
            worth posting, adds captions, and reframes them vertical for TikTok,
            Reels, and Shorts.
          </p>
          <div className="cta-row">
            <Link href="/signup" className="btn btn-primary btn-lg">
              Start free
            </Link>
            <a href="#how" className="btn btn-ghost btn-lg">
              See how it works
            </a>
          </div>
          <p className="trust">
            <b>Free while in beta</b> &nbsp;·&nbsp; no credit card &nbsp;·&nbsp;
            big files welcome
          </p>
        </div>

        {/* signature device */}
        <div className="device" aria-hidden="true">
          <div className="device-top">
            <div className="dots">
              <i />
              <i />
              <i />
            </div>
            <span className="src-label">SOURCE · 02:14:50</span>
          </div>
          <div className="timeline">
            <span className="scan" />
            <span className="tick" style={h("30%")} />
            <span className="tick moment" style={h("80%")} />
            <span className="tick" style={h("45%")} />
            <span className="tick" style={h("25%")} />
            <span className="tick" style={h("55%")} />
            <span className="tick moment b" style={h("90%")} />
            <span className="tick" style={h("35%")} />
            <span className="tick" style={h("50%")} />
            <span className="tick" style={h("28%")} />
            <span className="tick moment c" style={h("75%")} />
            <span className="tick" style={h("40%")} />
            <span className="tick" style={h("32%")} />
          </div>
          <div className="arrow-tag">
            <span className="ln" />3 moments found<span className="ln" />
          </div>
          <div className="clips">
            <div className="clip">
              <span className="tc">00:12:30</span>
              <span className="play" />
              <span className="cap">
                <span>
                  this part <span className="y">changed</span> everything
                </span>
              </span>
            </div>
            <div className="clip">
              <span className="tc">00:58:04</span>
              <span className="play" />
              <span className="cap">
                <span>
                  nobody <span className="y">tells you</span> this
                </span>
              </span>
            </div>
            <div className="clip">
              <span className="tc">01:46:18</span>
              <span className="play" />
              <span className="cap">
                <span>
                  the <span className="y">real</span> reason
                </span>
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="divider" />

      {/* how it works */}
      <section id="how" className="wrap rv">
        <div className="sec-head">
          <span className="eyebrow">How it works</span>
          <h2>Three steps. No timeline scrubbing.</h2>
          <p>
            You bring the recording. Gyrom does the watching, cutting, and
            captioning.
          </p>
        </div>
        <div className="steps">
          <div className="step">
            <span className="num">STEP 01</span>
            <h3>Drop your video</h3>
            <p>
              Upload a long recording — a podcast, webinar, or stream. Hours-long
              and large files are welcome.
            </p>
            <div className="ic">
              <svg viewBox="0 0 24 24">
                <path d="M12 16V4m0 0L7 9m5-5l5 5" />
                <path d="M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2" />
              </svg>
            </div>
          </div>
          <div className="step">
            <span className="num">STEP 02</span>
            <h3>AI finds the moments</h3>
            <p>
              It reads the full transcript and pulls the segments most likely to
              land as standalone clips.
            </p>
            <div className="ic">
              <svg viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
            </div>
          </div>
          <div className="step">
            <span className="num">STEP 03</span>
            <h3>Get clips, ready to post</h3>
            <p>
              Each moment comes captioned and reframed to vertical 9:16 —
              download and post.
            </p>
            <div className="ic">
              <svg viewBox="0 0 24 24">
                <rect x="6" y="3" width="12" height="18" rx="2" />
                <path d="M10 7h4" />
              </svg>
            </div>
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* features */}
      <section id="features" className="wrap rv">
        <div className="sec-head">
          <span className="eyebrow">Why Gyrom</span>
          <h2>Built for the long stuff.</h2>
          <p>Most clippers choke on a three-hour upload. This one is made for it.</p>
        </div>
        <div className="feats">
          <div className="feat">
            <div className="fic">
              <svg viewBox="0 0 24 24">
                <path d="M3 12h4l3 8 4-16 3 8h4" />
              </svg>
            </div>
            <div>
              <h3>Made for long-form</h3>
              <p>
                Hours-long podcasts, webinars, and streams — not just short
                uploads. Big files go straight through.
              </p>
            </div>
          </div>
          <div className="feat">
            <div className="fic">
              <svg viewBox="0 0 24 24">
                <path d="M12 1v22M5 5l14 14M19 5L5 19" />
              </svg>
            </div>
            <div>
              <h3>No credit math</h3>
              <p>
                Simple per-video pricing. Process a 3-hour stream or a 2-minute
                clip without watching a meter tick down.
              </p>
            </div>
          </div>
          <div className="feat">
            <div className="fic">
              <svg viewBox="0 0 24 24">
                <rect x="3" y="6" width="18" height="12" rx="2" />
                <path d="M7 10h2m3 0h5M7 14h6" />
              </svg>
            </div>
            <div>
              <h3>Captions, automatically</h3>
              <p>
                Word-level captions baked into every clip — ready for sound-off
                feeds out of the box.
              </p>
            </div>
          </div>
          <div className="feat">
            <div className="fic">
              <svg viewBox="0 0 24 24">
                <rect x="8" y="3" width="8" height="18" rx="2" />
                <path d="M3 8v8m18-8v8" />
              </svg>
            </div>
            <div>
              <h3>Vertical, automatically</h3>
              <p>
                Every clip reframed to 9:16 for TikTok, Reels, and Shorts — no
                manual cropping.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* who it's for */}
      <section id="who" className="wrap rv">
        <div className="sec-head">
          <span className="eyebrow">Who it&apos;s for</span>
          <h2>Made for people who record a lot.</h2>
          <p>
            If you make long-form content, Gyrom turns it into a steady stream of
            short clips without the editing afternoon.
          </p>
        </div>
        <div className="aud">
          <div className="aud-card">
            <div className="aic">
              <svg viewBox="0 0 24 24">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0014 0M12 18v3" />
              </svg>
            </div>
            <h3>Podcasters</h3>
            <p>
              Turn every episode into a handful of shareable moments — without
              re-listening to the whole thing.
            </p>
          </div>
          <div className="aud-card">
            <div className="aic">
              <svg viewBox="0 0 24 24">
                <rect x="3" y="5" width="18" height="14" rx="3" />
                <path d="M10 9l5 3-5 3z" />
              </svg>
            </div>
            <h3>YouTubers</h3>
            <p>
              Spin long uploads and streams into vertical Shorts, Reels, and
              TikToks to reach new viewers.
            </p>
          </div>
          <div className="aud-card">
            <div className="aic">
              <svg viewBox="0 0 24 24">
                <path d="M2 8l10-4 10 4-10 4z" />
                <path d="M6 10v5c0 1.4 3 3 6 3s6-1.6 6-3v-5" />
              </svg>
            </div>
            <h3>Coaches &amp; educators</h3>
            <p>
              Pull the most useful explanations out of webinars and lessons to
              share as bite-sized teaching clips.
            </p>
          </div>
          <div className="aud-card">
            <div className="aic">
              <svg viewBox="0 0 24 24">
                <circle cx="9" cy="8" r="3" />
                <path d="M3 20a6 6 0 0112 0M16 6a3 3 0 010 6M21 20a6 6 0 00-5-5.9" />
              </svg>
            </div>
            <h3>Agencies</h3>
            <p>
              Clip client recordings faster and hand back ready-to-post verticals
              instead of raw footage.
            </p>
          </div>
          <div className="aud-card">
            <div className="aic">
              <svg viewBox="0 0 24 24">
                <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
              </svg>
            </div>
            <h3>Founders building in public</h3>
            <p>
              Take your talks, interviews, and updates and keep a feed alive
              without a dedicated editor.
            </p>
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* manual vs gyrom */}
      <section className="wrap rv">
        <div className="sec-head">
          <span className="eyebrow">The difference</span>
          <h2>Manual editing vs Gyrom.</h2>
          <p>
            The same job, minus the scrubbing, cutting, and exporting by hand.
          </p>
        </div>
        <div className="vs">
          <div className="vs-card">
            <div className="vs-h">
              <span className="vs-tag">Manual</span>
              <h3>Editing it yourself</h3>
            </div>
            <div className="vs-list">
              <div className="vs-row">
                <svg viewBox="0 0 24 24">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
                <span>Watch the full video back to find anything worth using</span>
              </div>
              <div className="vs-row">
                <svg viewBox="0 0 24 24">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
                <span>Note timestamps and hunt for the right moments</span>
              </div>
              <div className="vs-row">
                <svg viewBox="0 0 24 24">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
                <span>Cut each clip by hand in an editor</span>
              </div>
              <div className="vs-row">
                <svg viewBox="0 0 24 24">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
                <span>Type out and time captions yourself</span>
              </div>
              <div className="vs-row">
                <svg viewBox="0 0 24 24">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
                <span>Reframe and export vertical formats one by one</span>
              </div>
            </div>
          </div>
          <div className="vs-card gyrom">
            <div className="vs-h">
              <span className="vs-tag">Gyrom</span>
              <h3>Letting it do the work</h3>
            </div>
            <div className="vs-list">
              <div className="vs-row">
                <svg viewBox="0 0 24 24">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                <span>Upload the video — long files welcome</span>
              </div>
              <div className="vs-row">
                <svg viewBox="0 0 24 24">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                <span>AI reads the transcript and finds the moments</span>
              </div>
              <div className="vs-row">
                <svg viewBox="0 0 24 24">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                <span>Clips are generated for you automatically</span>
              </div>
              <div className="vs-row">
                <svg viewBox="0 0 24 24">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                <span>Captions come baked into every clip</span>
              </div>
              <div className="vs-row">
                <svg viewBox="0 0 24 24">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                <span>Vertical 9:16 clips, ready to download and post</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* pricing teaser */}
      <section id="pricing" className="wrap rv">
        <div className="sec-head">
          <span className="eyebrow">Pricing</span>
          <h2>Free while we&apos;re in beta.</h2>
        </div>
        <div className="price">
          <div className="price-l">
            <span className="tag">Early access</span>
            <h2>Get in now, clip for free.</h2>
            <p>
              We&apos;re opening access while Gyrom is in beta. Simple per-video
              pricing is coming next — no per-minute credits, no surprises at the
              end of the month.
            </p>
            <div className="cta-row">
              <Link href="/signup" className="btn btn-primary btn-lg">
                Get early access
              </Link>
            </div>
          </div>
          <div className="price-r">
            <div className="pr-item">
              <svg viewBox="0 0 24 24">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              <span>
                <b>Free</b> during the beta period
              </span>
            </div>
            <div className="pr-item">
              <svg viewBox="0 0 24 24">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              <span>No credit card to start</span>
            </div>
            <div className="pr-item">
              <svg viewBox="0 0 24 24">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              <span>
                Per-video pricing later — <b>no credit anxiety</b>
              </span>
            </div>
            <div className="pr-item">
              <svg viewBox="0 0 24 24">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              <span>Shape the product with your feedback</span>
            </div>
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* faq */}
      <section id="faq" className="wrap rv">
        <div className="sec-head">
          <span className="eyebrow">FAQ</span>
          <h2>Questions, answered.</h2>
        </div>
        <div className="faq-list">
          <details className="faq-item">
            <summary>
              What types of videos can I upload?
              <span className="pm" aria-hidden="true" />
            </summary>
            <p className="faq-a">
              Gyrom is built for long-form recordings — podcasts, interviews,
              webinars, talks, and streams. It works best when there&apos;s
              spoken content to transcribe, since that&apos;s what it reads to
              find moments.
            </p>
          </details>
          <details className="faq-item">
            <summary>
              Is Gyrom free?
              <span className="pm" aria-hidden="true" />
            </summary>
            <p className="faq-a">
              Yes — Gyrom is free while it&apos;s in beta, and there&apos;s no
              credit card required to start. We plan to introduce simple
              per-video pricing later, but anything you do during the beta stays
              free.
            </p>
          </details>
          <details className="faq-item">
            <summary>
              Does it add captions?
              <span className="pm" aria-hidden="true" />
            </summary>
            <p className="faq-a">
              Yes. Every clip comes with captions generated from the
              transcript and burned into the video, so it reads clearly in
              sound-off feeds.
            </p>
          </details>
          <details className="faq-item">
            <summary>
              Which platforms are the clips for?
              <span className="pm" aria-hidden="true" />
            </summary>
            <p className="faq-a">
              Clips are reframed to vertical 9:16, which fits TikTok, Instagram
              Reels, and YouTube Shorts. You download the file and post it
              wherever you like.
            </p>
          </details>
          <details className="faq-item">
            <summary>
              Can I use it for podcasts and interviews?
              <span className="pm" aria-hidden="true" />
            </summary>
            <p className="faq-a">
              That&apos;s exactly what it&apos;s made for. Conversation-heavy
              recordings like podcasts and interviews give Gyrom plenty of
              transcript to work from when picking moments.
            </p>
          </details>
          <details className="faq-item">
            <summary>
              Is Gyrom still in beta?
              <span className="pm" aria-hidden="true" />
            </summary>
            <p className="faq-a">
              Yes, Gyrom is in active beta. That means it&apos;s free to use and
              we&apos;re still improving things — your feedback genuinely shapes
              what gets built next.
            </p>
          </details>
        </div>
      </section>

      <div className="divider" />

      {/* final cta */}
      <section className="wrap final rv">
        <h2>Stop scrubbing through your own footage.</h2>
        <p>Upload one long video and see the clips it&apos;s been hiding.</p>
        <Link href="/signup" className="btn btn-primary btn-lg">
          Start free
        </Link>
      </section>

      <footer>
        <div className="wrap foot-in">
          <Link href="/" className="brand" style={{ fontSize: "17px" }}>
            <span className="mark" />
            Gyrom
          </Link>
          <div className="foot-links">
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </div>
          <span className="mono">© 2026 Gyrom</span>
        </div>
      </footer>
    </div>
  );
}
