const app = require('./app');

test('test 1', () => {
	expect(getSongIndex('unknown')).toEqual(-1);
});
