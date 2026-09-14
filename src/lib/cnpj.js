export const normalizeCNPJ = (value) => String(value || '').replace(/\D/g, '').slice(0, 14);

export const formatCNPJ = (value) => {
  const digits = normalizeCNPJ(value);
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
};

const calculateDigit = (digits, length) => {
  let factor = length - 7;
  let total = 0;

  for (let index = 0; index < length; index += 1) {
    total += Number(digits[index]) * factor;
    factor -= 1;
    if (factor === 1) factor = 9;
  }

  const remainder = total % 11;
  return remainder < 2 ? 0 : 11 - remainder;
};

export const isValidCNPJ = (value) => {
  const digits = normalizeCNPJ(value);
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;

  return calculateDigit(digits, 12) === Number(digits[12])
    && calculateDigit(digits, 13) === Number(digits[13]);
};
