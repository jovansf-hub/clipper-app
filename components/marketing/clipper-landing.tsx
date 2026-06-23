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
          </div>
          <span className="mono">© 2026 Gyrom</span>
        </div>
      </footer>
    </div>
  );
}
