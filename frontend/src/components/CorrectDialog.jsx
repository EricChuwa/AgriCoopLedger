import { useState } from "react";
import Field from "./Field.jsx";
import ReasonDialog from "./ReverseDialog.jsx";
import { GRADES, fmt, kgText } from "../lib/format.js";
import { kgError } from "../lib/validation.js";

// Change the weight and/or grade of a delivery, with a reason. A Manager applies it at once ("correct");
// a Collection Clerk sends it to a Manager for approval ("request").
// onSubmit({ weight_kg?, grade?, reason }) is async and returns { error } or { data }.
export default function CorrectDialog({ delivery, mode, onSubmit, onClose }) {
  const [kg, setKg] = useState(String(delivery.weight_kg));
  const [grade, setGrade] = useState(delivery.grade);
  const [kgProblem, setKgProblem] = useState("");
  const asking = mode === "request";

  const body = () => {
    const out = {};
    const clean = kg.replace(/[,\s]/g, "");
    if (Number(clean) !== delivery.weight_kg) out.weight_kg = clean;
    if (grade !== delivery.grade) out.grade = grade;
    return out;
  };

  const beforeSubmit = () => {
    const problem = kgError(kg);
    setKgProblem(problem);
    if (problem) { document.getElementById("kg")?.focus(); return "Check the weight."; }
    if (Object.keys(body()).length === 0) return "Change the weight or the grade first.";
    return "";
  };

  return (
    <ReasonDialog
      title={asking ? "Ask a Manager to correct this delivery" : "Correct this delivery"}
      summary={`${delivery.receipt_no}: ${delivery.farmer_name}, ${kgText(delivery.weight_kg)} ${delivery.produce_name.toLowerCase()}, grade ${delivery.grade}, worth ${fmt(delivery.value)} RWF.`}
      note={asking
        ? "Nothing changes until a Manager approves. The current values stay on record either way."
        : "The old weight, grade and value are kept on record with your name and the reason. The value is recalculated at the price the delivery was recorded under."}
      submitLabel={asking ? "Send request" : "Save correction"}
      danger={false}
      beforeSubmit={beforeSubmit}
      onConfirm={(reason) => onSubmit({ ...body(), reason })}
      onClose={onClose}>
      <Field id="kg" label="Correct weight (kg)" error={kgProblem}>
        {(p) => <input {...p} type="text" inputMode="decimal" autoComplete="off" value={kg}
          onChange={(e) => { setKg(e.target.value); setKgProblem(""); }} />}
      </Field>
      <Field id="grade" label="Correct grade">
        {(p) => (
          <select {...p} value={grade} onChange={(e) => setGrade(e.target.value)}>
            {GRADES.map((g) => <option key={g} value={g}>Grade {g}</option>)}
          </select>
        )}
      </Field>
    </ReasonDialog>
  );
}
