import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import dayjs from "dayjs";
import { mongoDatabase } from "./mongoDatabase.js";
import { participanteSchema } from "./schemas/participanteSchema.js";
import { messageSchema } from "./schemas/messageSchema.js";
import { stripHtml } from "string-strip-html";
import { ObjectId, ObjectID } from "bson";

dotenv.config();

async function init() {
  await mongoDatabase.openInstance();
}

const app = express();
app.use(express.json());
app.use(cors());

const port = process.env.PORT || 5000;

try {
  (async () => {
    await init();
    app.listen(port, () => {
      console.log(`Server is running on: http://localhost:${port}`);
    });
  })();
} catch (error) {
  console.log(error);
}

app.post("/participants", async (req, res) => {
  try {
    const body = req.body;

    const validate = participanteSchema.validate({
      name: body.name,
    });

    if (validate.error) {
      res.status(422).send(validate.error.message);
      return;
    }

    body.name = stripHtml(body.name).result.trim();

    const user = await mongoDatabase.db
      .collection("participante")
      .findOne({ name: body.name });
    if (user) {
      res.sendStatus(409);
      return;
    }

    await mongoDatabase.db
      .collection("participante")
      .insertOne({ name: body.name, lastStatus: Date.now() });

    await mongoDatabase.db.collection("mensagem").insertOne({
      from: body.name,
      to: "Todos",
      text: "entra na sala...",
      type: "status",
      time: dayjs().format("HH:MM:ss"),
    });

    res.sendStatus(201);
  } catch (err) {
    console.log(err);
    res.sendStatus(500);
  }
});

app.get("/participants", async (req, res) => {
  try {
    const participantes = await mongoDatabase.db
      .collection("participante")
      .find()
      .toArray();
    res.send(participantes);
  } catch (err) {
    console.log(err);
    res.sendStatus(500);
  }
});

app.post("/messages", async (req, res) => {
  try {
    const body = req.body;
    const { error } = messageSchema.validate(body, { abortEarly: false });
    if (error) {
      res.send(error.details.map((e) => e.message)).status(422);
      return;
    }

    console.log(req.headers);
    const { user } = req.headers;
    if (!user) {
      res.status(422).send("user header is required");
      return;
    }

    const participante = await mongoDatabase.db
      .collection("participante")
      .findOne({ name: user });
    if (!participante) {
      res.status(404).send("Participante não encontrado");
      return;
    }

    body.text = stripHtml(body.text).result.trim();

    console.log(body);

    await mongoDatabase.db.collection("mensagem").insertOne({
      from: user,
      ...body,
      time: dayjs().format("HH:MM:ss"),
    });

    res.sendStatus(201);
  } catch (err) {
    console.log(err);
    res.sendStatus(500);
  }
});

app.get("/messages", async (req, res) => {
  try {
    const { limit } = req.query;
    const { user } = req.headers;

    const mensagens = await mongoDatabase.db
      .collection("mensagem")
      .find({
        $or: [
          {
            $and: [
              { $or: [{ type: "private_message" }, { type: "message" }] },
              { $or: [{ to: user }, { from: user }] },
            ],
          },
          { to: "Todos" },
        ],
      })
      .sort({ $natural: -1 })
      .limit(limit === undefined ? 0 : Number(limit))
      .toArray();

    res.send(mensagens.reverse());
  } catch (err) {
    console.log(err);
    res.sendStatus(500);
  }
});

app.post("/status", async (req, res) => {
  try {
    const { user } = req.headers;

    if (!user) {
      return res.send("user is required").status(422);
    }

    const userExists = await mongoDatabase.db
      .collection("participante")
      .findOne({ name: user });

    if (!userExists) {
      res.sendStatus(404);
      return;
    }

    userExists.lastStatus = Date.now();

    await mongoDatabase.db
      .collection("participante")
      .updateOne({ _id: userExists._id }, { $set: userExists });

    res.sendStatus(200);
  } catch (err) {
    console.log(err);
  }
});

app.delete("/messages/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { user } = req.headers;

    const message = await mongoDatabase.db
      .collection("mensagem")
      .findOne({ _id: ObjectId(id) });

    if (!message) return res.sendStatus(404);

    if (message.from != user) return res.sendStatus(401);

    await mongoDatabase.db
      .collection("mensagem")
      .deleteOne({ _id: message._id });

    res.sendStatus(204);
  } catch (err) {
    res.sendStatus(500);
    console.log(err);
  }
});

app.put("/messages/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { user } = req.headers;

    const body = req.body;
    const { error } = messageSchema.validate(body, { abortEarly: false });
    if (error) {
      res.send(error.details.map((e) => e.message)).status(422);
      return;
    }

    const message = await mongoDatabase.db
      .collection("mensagem")
      .findOne({ _id: ObjectId(id) });

    if (!message) return res.sendStatus(404);

    if (message.from != user) return res.sendStatus(401);

    await mongoDatabase.db
      .collection("mensagem")
      .updateOne({ _id: message._id }, { $set: body });

    res.sendStatus(204);
  } catch (err) {
    res.sendStatus(500);
    console.log(err);
  }
});

setInterval(async () => {
  const participantes = await mongoDatabase.db
    .collection("participante")
    .find()
    .toArray();

  participantes.forEach((participante) => {
    let lastStatus = participante.lastStatus;
    let now = Date.now();

    if (lastStatus < now - 10000) {
      mongoDatabase.db
        .collection("participante")
        .deleteOne({ _id: participante._id });

      mongoDatabase.db.collection("mensagem").insertOne({
        from: participante.name,
        to: "Todos",
        text: "sai da sala...",
        type: "status",
        time: dayjs().format("HH:MM:ss"),
      });
    }
  });
}, 1500);
