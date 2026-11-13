import { TaskBoard } from "./components/TaskBoard";
import { SyncHealthPanel } from "./components/SyncHealthPanel";

export function App() {
  return (
    <main>
      <h1>Task Manager</h1>
      <SyncHealthPanel />
      <TaskBoard />
    </main>
  );
}

export default App;
