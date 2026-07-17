// Simulates an unrelated app entry point living alongside model files in
// the same directory — no mongoose import, no Schema/model call. The
// adapter must never import this: doing so for a real app entry point once
// actually started a listening server as a side effect (see the "no
// unrelated files" test in the adapter test suite).
console.log("Server running at http://localhost:3001");

export const app = { listening: true };
