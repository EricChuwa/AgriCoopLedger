import InfoTip from "./InfoTip.jsx";

export const SAMPLE_RE = /\s*\(sample data\)\s*$/i;
export const SAMPLE_MESSAGE = "This is sample data. It is made up to show how the system works.";
export const isSample = (name) => SAMPLE_RE.test(name || "");
export const plainCoopName = (name) => (name || "").replace(SAMPLE_RE, "");

// The cooperative's name. A demo cooperative carries "(sample data)" in its name; that note is shown as an "i"
// with a message instead of being written out beside the name everywhere.
export default function CoopName({ name }) {
  return (
    <>
      {plainCoopName(name)}
      {isSample(name) && <InfoTip text={SAMPLE_MESSAGE} label="About this sample data" />}
    </>
  );
}
