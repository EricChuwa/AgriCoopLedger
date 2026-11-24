import { useState } from "react";

// Shared form state and validation.
// rules: { fieldName: (value, allValues) => "error message" or "" }
export default function useForm(initial, rules) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});

  const names = Object.keys(rules);

  const check = (name, vals) =>
    setErrors((prev) => ({ ...prev, [name]: rules[name](vals[name], vals) }));

  const handleChange = (e) => {
    const { name, value } = e.target;
    const next = { ...values, [name]: value };
    setValues(next);
    if (errors[name]) check(name, next);
  };

  // Sets one or more fields from code (for example filling the amount when a farmer is chosen).
  const setValue = (changes) => {
    const next = { ...values, ...changes };
    setValues(next);
    Object.keys(changes).forEach((name) => { if (errors[name]) check(name, next); });
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    if (value !== "" || e.target.tagName === "SELECT") check(name, values);
  };

  // Validates every field, focuses the first invalid one, returns true if all pass.
  const validate = () => {
    const next = {};
    names.forEach((name) => { next[name] = rules[name](values[name], values); });
    setErrors(next);
    const firstBad = names.find((name) => next[name]);
    if (firstBad) document.getElementById(firstBad)?.focus();
    return !firstBad;
  };

  // Shows an error the server reported against one field (for example a phone number already in use).
  const setFieldError = (name, message) => {
    setErrors((prev) => ({ ...prev, [name]: message }));
    document.getElementById(name)?.focus();
  };

  return { values, errors, handleChange, setValue, handleBlur, validate, setFieldError };
}
