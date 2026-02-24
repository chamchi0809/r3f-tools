import { Canvas } from "@react-three/fiber";
import { Prefab } from "react-three-engine";

function App() {
  return (
    <Canvas>
      <ambientLight />
      <Prefab id="1234" />
    </Canvas>
  );
}

export default App;
