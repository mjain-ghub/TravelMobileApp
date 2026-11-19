import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { cardBrand, expiryValid, formatCard, isIsoDate, isoInDays, luhnValid, nightsBetween } from '../src/lib/format';

describe('payment helpers', () => {
  test('Luhn', () => {
    assert.equal(luhnValid('4242 4242 4242 4242'), true);
    assert.equal(luhnValid('4242424242424241'), false);
    assert.equal(luhnValid('1234'), false);
  });
  test('brand + formatting', () => {
    assert.equal(cardBrand('4242424242424242'), 'Visa');
    assert.equal(cardBrand('5555555555554444'), 'Mastercard');
    assert.equal(cardBrand('378282246310005'), 'Amex');
    assert.equal(formatCard('4242424242424242'), '4242 4242 4242 4242');
  });
  test('expiry must be a real future MM/YY', () => {
    const now = new Date(2026, 10, 19);
    assert.equal(expiryValid('11/26', now), true);
    assert.equal(expiryValid('10/26', now), false);
    assert.equal(expiryValid('13/30', now), false);
    assert.equal(expiryValid('1/30', now), false);
  });
});

describe('date helpers', () => {
  test('isoInDays crosses month and year boundaries', () => {
    assert.equal(isoInDays(30, new Date(2026, 10, 19)), '2026-12-19');
    assert.equal(isoInDays(45, new Date(2026, 11, 20)), '2027-02-03');
  });
  test('isIsoDate rejects impossible dates', () => {
    assert.equal(isIsoDate('2026-02-29'), false);
    assert.equal(isIsoDate('2028-02-29'), true);
    assert.equal(isIsoDate('26-1-1'), false);
  });
  test('nightsBetween', () => {
    assert.equal(nightsBetween('2026-12-19', '2026-12-22'), 3);
  });
});
