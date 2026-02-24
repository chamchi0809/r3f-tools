function App() {
  const navigateToEditor = () => {
    window.location.assign("/editor");
  };

  return (
    <div style={{ padding: "2rem", fontFamily: "system-ui" }}>
      <h1>React Three Engine Demo</h1>
      <p>
        This is a demonstration application for the <code>react-three-engine</code> package.
      </p>
      <nav>
        <button
          onClick={navigateToEditor}
          style={{
            display: "inline-block",
            marginTop: "1rem",
            padding: "0.5rem 1rem",
            background: "#0070f3",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "1rem",
          }}
        >
          Open Editor
        </button>
      </nav>
    </div>
  );
}

export default App;
