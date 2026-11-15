export default function BusinessLoading() {
  return (
    <div role="status" aria-label="Carregando" className="animate-pulse">
      <div className="h-7 w-48 rounded-lg bg-line" />
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-[14px] bg-line" />)}
      </div>
      <div className="mt-4 h-64 rounded-[14px] bg-line" />
    </div>
  );
}
