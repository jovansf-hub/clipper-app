import Link from "next/link";

export function FinalCTA() {
  return (
    <section className="bg-indigo-600 py-24">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <h2 className="text-4xl font-extrabold text-white sm:text-5xl">
          Ready to create viral clips?
        </h2>
        <p className="mt-4 text-xl text-indigo-200">
          Join creators turning long videos into viral content.
        </p>
        <div className="mt-10">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-full bg-white px-10 py-4 text-base font-semibold text-indigo-600 transition-all hover:-translate-y-0.5 hover:bg-indigo-50 hover:shadow-lg hover:shadow-indigo-900/20"
          >
            Start free now
          </Link>
        </div>
      </div>
    </section>
  );
}
