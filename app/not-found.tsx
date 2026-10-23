export default function NotFound() {
  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: 16,
        textAlign: "center",
      }}
    >
      <p style={{ fontFamily: "var(--font-hand), cursive", fontSize: "2rem", margin: 0 }}>This letter got lost in the mail.</p>
      <p style={{ margin: 0, opacity: 0.7 }}>Check the link, or make your own.</p>
      <a className="cute-btn" href="/customize" style={{ textDecoration: "none", marginTop: 8 }}>
        Make a letter ♡
      </a>
    </main>
  );
}
