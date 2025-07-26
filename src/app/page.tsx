import Image from 'next/image';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white font-sans">
      <Image
        src="/logo.png"
        alt="EHI! Lab Logo"
        width={440}
        height={440}
        className="mb-10"
        priority
      />
      <p className="text-2xl font-semibold text-neutral-800 max-w-xl text-center tracking-tight mt-8">
        L’automazione che si fa sentire.<br />
        <span className="text-blue-600 font-bold">
          Digitalizza il tuo business, con stile.
        </span>
      </p>
    </main>
  );
}
