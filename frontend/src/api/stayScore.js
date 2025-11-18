export async function fetchStayScore(address) {
  const res = await fetch(
    `http://localhost:4000/api/stay-score?address=${encodeURIComponent(address)}`
  );
  return await res.json();
}
