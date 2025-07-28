'use client';

export default function LoginLayout({ children }) {
  return (
    <div className="flex h-screen bg-[#f7f7f7] items-center justify-center">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-lg">
        {children}
      </div>
    </div>
  );
}
