import express from 'express';
import cors from 'cors';

const app = express();
const port = 4009;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello World from Backend!');
});

app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});
