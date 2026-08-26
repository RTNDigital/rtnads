export default function IntelligenceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="-m-6 flex h-[calc(100vh-3.5rem)]">
      {children}
    </div>
  );
}
