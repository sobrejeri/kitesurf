import Link from 'next/link';

export default function NotFound() {
  return (
    <>
      <h1>Loja não encontrada</h1>
      <p className="lead">Esta loja não existe ou ainda não foi publicada pela escola.</p>
      <p style={{ marginTop: 16 }}><Link className="btn" href="/escola">Ver escolas</Link></p>
    </>
  );
}
