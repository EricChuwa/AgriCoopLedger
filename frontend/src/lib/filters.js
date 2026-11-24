export const matchesText = (haystacks, query) => {
  const q = query.trim().toLowerCase();
  return q === "" || haystacks.some((h) => (h || "").toLowerCase().includes(q));
};
