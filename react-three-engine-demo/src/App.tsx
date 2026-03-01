import { Canvas } from "@react-three/fiber";
import { Prefab } from "react-three-engine";

function App() {
  return (
    <Canvas>
      <ambientLight />
      <Prefab id="1234" ref={(el) => console.log(el?.findWithTag("door"))} />
    </Canvas>
  );
}

export default App;
