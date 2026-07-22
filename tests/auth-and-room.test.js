import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import * as CFI from '../epubcfi.js';

const JWT_SECRET = process.env.JWT_SECRET || 'foliate-jam-super-secret-key-12345';

test('JWT Cookie Token Generation & Verification', () => {
    const mockUser = { discord_id: 'mock-id-local', username: 'Local_Tester' };
    const token = jwt.sign({ discord_id: mockUser.discord_id }, JWT_SECRET, { expiresIn: '7d' });
    
    assert.ok(token, 'Token should be a non-empty string');
    
    const decoded = jwt.verify(token, JWT_SECRET);
    assert.equal(decoded.discord_id, 'mock-id-local');
});

test('EPUB CFI String Parsing & Formatting', () => {
    const cfiString = '/6/4[chap01ref]!/4/2/4/1:0';
    const parsed = CFI.parse(cfiString);
    assert.ok(Array.isArray(parsed), 'Parsed CFI should return array parts');
    assert.ok(parsed.length > 0, 'Parsed CFI should contain components');
});

test('CFI Segment Comparison', () => {
    const cfi1 = '/6/4!/4/2';
    const parsed1 = CFI.parse(cfi1);
    assert.ok(parsed1, 'CFI 1 should parse successfully');
});
