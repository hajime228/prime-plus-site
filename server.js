const express = require("express");
const fs = require("fs");
const bodyParser = require("body-parser");
const XLSX = require("xlsx");

const app = express();

app.use(bodyParser.json());
app.use(express.static("public"));

const PASSWORD = "4589admin";

app.get("/slots", (req, res) => {

    const data = fs.readFileSync("slots.json");

    res.json(JSON.parse(data));

});

app.post("/slots", (req, res) => {

    if (req.body.password !== PASSWORD) {

        return res.sendStatus(403);

    }

    fs.writeFileSync(
        "slots.json",
        JSON.stringify(req.body.slots)
    );

    res.sendStatus(200);

});

app.get("/doma", (req, res) => {

    const wb = XLSX.readFile("doma.xlsx");

    const sheet = wb.Sheets[wb.SheetNames[0];

    const data = XLSX.utils.sheet_to_json(sheet);

    res.json(data);

});

app.listen(process.env.PORT || 3000);