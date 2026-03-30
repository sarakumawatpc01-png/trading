import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT_SPECS_DIR = path.join(__dirname, 'agentSpecs');

function readSpecFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function validateSpec({ agent, spec, specVersion }) {
  if (!spec || typeof spec !== 'object') throw new Error(`Spec for ${agent} must be an object`);
  if (typeof spec.instruction !== 'string' || !spec.instruction.trim()) throw new Error(`Spec for ${agent} has invalid instruction`);
  if (typeof spec.knowledge !== 'string' || !spec.knowledge.trim()) throw new Error(`Spec for ${agent} has invalid knowledge`);
  if (!spec.skill || typeof spec.skill !== 'object' || Array.isArray(spec.skill)) throw new Error(`Spec for ${agent} has invalid skill object`);
  const profileVersion = String(spec.skill.profileVersion || specVersion);
  return {
    instruction: spec.instruction,
    knowledge: spec.knowledge,
    skill: {
      ...spec.skill,
      profileVersion
    }
  };
}

export function loadAgentSpecsFromFiles({ agents, specVersion }) {
  const loaded = {};
  for (const agent of agents) {
    const filePath = path.join(AGENT_SPECS_DIR, `${agent}.json`);
    if (!fs.existsSync(filePath)) throw new Error(`Missing agent spec file for ${agent}: ${filePath}`);
    const parsed = readSpecFile(filePath);
    loaded[agent] = validateSpec({ agent, spec: parsed, specVersion });
  }
  return loaded;
}
