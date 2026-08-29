import { useState } from "react";

interface Props {
  name: string;
}

export function TestComponent({ name }: { name: string }) {
  return (
    <div className="test">
      <button>Click me</button>
    </div>
  );
}
