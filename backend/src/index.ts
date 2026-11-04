/** HTTP server entrypoint. Separate process from the queue workers (see worker-main.ts). */
import { createApp } from "./app";

const DEFAULT_PORT = 3000;
const port = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : DEFAULT_PORT;

const app = createApp();

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Task Manager backend listening on port ${port}`);
});
