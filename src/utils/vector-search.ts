export const cosineSimilarity = (
  left: number[],
  right: number[],
): number | undefined => {
  if (left.length === 0 || left.length !== right.length) return undefined;

  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index]!;
    const rightValue = right[index]!;
    dotProduct += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  const magnitude = Math.sqrt(leftMagnitude * rightMagnitude);
  return magnitude === 0 ? undefined : dotProduct / magnitude;
};
