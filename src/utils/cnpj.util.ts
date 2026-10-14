export const validateCnpj = (cnpj: string) => {
  const cnpjNumbers = cnpj.replace(/\D/g, '');

  if (cnpjNumbers.length !== 14) return false;

  if (cnpjNumbers === cnpjNumbers[0].repeat(14)) return false;

  if (cnpjNumbers.length !== 14) return false;

  const firstDigitListCount = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const firstDigitResult = firstDigitListCount.reduce((acc, cur, idx) => acc + Number(cnpjNumbers[idx]) * cur, 0);
  const firstDigitRemainder = firstDigitResult % 11;

  const firstDigit = firstDigitRemainder < 2 ? 0 : 11 - firstDigitRemainder;

  const secondDigitListCount = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const secondDigitResult = secondDigitListCount.reduce((acc, cur, idx) => acc + Number(cnpjNumbers[idx]) * cur, 0);
  const secondDigitRemainder = secondDigitResult % 11;

  const secondDigit = secondDigitRemainder < 2 ? 0 : 11 - secondDigitRemainder;

  const finalTwoDigits = `${firstDigit}${secondDigit}`;

  if (cnpjNumbers.slice(-2) === finalTwoDigits) {
    return true;
  } else {
    return false;
  }
};