import { validateGeneratedUI } from "../../validator/validator/validateGeneratedUI.js";

type PerformanceCase = {
  name: string;
  code: string;
};

type Measurement = {
  name: string;
  sourceBytes: number;
  averageMs: number;
  minMs: number;
  maxMs: number;
  valid: boolean;
};

const WARMUP_RUNS = 5;
const MEASUREMENT_RUNS = 20;

const smallCode = `
function SimpleUI() {
  return <button>Continue</button>;
}
`;

const mediumCode = `
import { useState } from "react";

function FormUI() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const handleSubmit = () => {
    if (!name || !email) {
      return;
    }
  };

  return (
    <div>
      <h1>Create Account</h1>

      <label>
        Name
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <label>
        Email
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>

      <button onClick={handleSubmit}>
        Submit
      </button>
    </div>
  );
}
`;

const largeCode = `
import { useState } from "react";

function LargeDashboard() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");

  const items = [
    "Dashboard",
    "Profile",
    "Settings",
    "Projects",
    "Tasks",
    "Reports",
    "Notifications",
    "Messages",
    "Analytics",
    "Help",
  ];

  const filteredItems = items.filter((item) =>
    item.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (item) => {
    setSelected(item);
  };

  return (
    <div>
      <header>
        <h1>Workspace</h1>

        <input
          value={search}
          placeholder="Search"
          onChange={(event) => setSearch(event.target.value)}
        />
      </header>

      <main>
        <section>
          <h2>Navigation</h2>

          <div>
            {filteredItems.map((item) => (
              <button
                key={item}
                onClick={() => handleSelect(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2>Selected</h2>

          {selected ? (
            <div>
              <p>You selected:</p>
              <strong>{selected}</strong>
            </div>
          ) : (
            <p>Select an item to continue.</p>
          )}
        </section>

        <section>
          <h2>Preferences</h2>

          <label>
            Display name
            <input placeholder="Enter your name" />
          </label>

          <label>
            Language
            <select defaultValue="english">
              <option value="english">English</option>
              <option value="telugu">Telugu</option>
              <option value="hindi">Hindi</option>
            </select>
          </label>

          <label>
            Notifications
            <input type="checkbox" />
          </label>
        </section>

        <section>
          <h2>Recent Activity</h2>

          <ul>
            {items.map((item, index) => (
              <li key={item}>
                <span>{item}</span>
                <span>Activity {index + 1}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2>Actions</h2>

          <button>Save changes</button>
          <button>Cancel</button>
          <button>Reset</button>
        </section>
      </main>
    </div>
  );
}
`;

const performanceCases: PerformanceCase[] = [
  {
    name: "Small component",
    code: smallCode,
  },
  {
    name: "Medium component",
    code: mediumCode,
  },
  {
    name: "Large component",
    code: largeCode,
  },
];

function measureCase(testCase: PerformanceCase): Measurement {
  // Warm-up runs reduce noise from parser/module/JIT startup effects.
  for (let i = 0; i < WARMUP_RUNS; i++) {
    validateGeneratedUI(testCase.code);
  }

  const timings: number[] = [];
  let lastResultValid = false;

  for (let i = 0; i < MEASUREMENT_RUNS; i++) {
    const start = performance.now();

    const result = validateGeneratedUI(testCase.code);

    const end = performance.now();

    timings.push(end - start);
    lastResultValid = result.valid;
  }

  const total = timings.reduce((sum, value) => sum + value, 0);
  const averageMs = total / timings.length;
  const minMs = Math.min(...timings);
  const maxMs = Math.max(...timings);

  return {
    name: testCase.name,
    sourceBytes: Buffer.byteLength(testCase.code, "utf8"),
    averageMs,
    minMs,
    maxMs,
    valid: lastResultValid,
  };
}

function printResults(results: Measurement[]) {
  console.log("\nAURAGEN AST VALIDATOR PERFORMANCE EXPERIMENT\n");

  console.log(
    `Warm-up runs: ${WARMUP_RUNS} | Measurement runs: ${MEASUREMENT_RUNS}\n`
  );

  console.log(
    "Case".padEnd(22) +
      "Size".padEnd(12) +
      "Average".padEnd(14) +
      "Min".padEnd(14) +
      "Max".padEnd(14) +
      "Result"
  );

  console.log("-".repeat(86));

  for (const result of results) {
    console.log(
      result.name.padEnd(22) +
        `${result.sourceBytes} B`.padEnd(12) +
        `${result.averageMs.toFixed(3)} ms`.padEnd(14) +
        `${result.minMs.toFixed(3)} ms`.padEnd(14) +
        `${result.maxMs.toFixed(3)} ms`.padEnd(14) +
        (result.valid ? "ACCEPT" : "REJECT")
    );
  }

  console.log("\nInterpretation:");
  console.log(
    "The experiment measures only AST/security validation time."
  );
  console.log(
    "LLM generation, network latency, file I/O, and rendering are not included."
  );
  console.log(
    "Results are measurements from the current environment, not universal performance guarantees."
  );
}

const results = performanceCases.map(measureCase);

printResults(results);