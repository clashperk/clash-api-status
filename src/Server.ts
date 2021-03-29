import Http from './Http';
import express from 'express';

const app = express();
const http = new Http();

app.use((req, res, next) => {
	res.header('Access-Control-Allow-Origin', '*');
	res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
	next();
});

app.get('/', (req, res) => res.json({ status: 'ok' }));

app.use((req, res, next) => {
	if (res.getHeader('X-Auth-Key') !== process.env.X_AUTH_KEY) {
		return res.status(403).json({ message: "Auth Failed!" });
	}
	next();
});

export const init = async () => {
	app.listen(process.env.PORT!, () => {
		console.log(`Server Listening on Port ${process.env.PORT}`);
	});

	return http.login().then(() => http.init());
}