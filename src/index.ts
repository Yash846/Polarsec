import express from "express";
import bodyParser from "body-parser";
import mysql from "mysql2";
import * as crypto from "crypto";
import { Request, Response } from "express";

const mysqlConfig = {
  host: "mysql_server",
  user: "yash",
  password: "secret",
  database: "lets_run",
};

const app = express();
let con = mysql.createConnection(mysqlConfig);

app.use(bodyParser.json());

// Regex to validate input type
const namePattern = /^[A-Za-z0-9]+(?:[-_\s]?[A-Za-z0-9]+)*$/;
const cityPattern = /^[A-Za-z]+(?:[-\s][A-Za-z]+)*$/;
const agePattern = /^(1?[0-9]|[1-9]{1})?[0-9]$/;

//generates public/private keys
function generateKeyPair(): crypto.KeyPairSyncResult<string, string> {
  return crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

//Creates users table on start if it does not exist
const createTable = () => {
  con.connect(function (err) {
    if (err) throw err;
    const sql = `
    CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        age INT NOT NULL,
        city VARCHAR(255) NOT NULL,
        total_distance_run FLOAT DEFAULT 0,
        public_key TEXT  -- Column to store the user's public key
    );`;
    con.query(sql, function (err, result) {
      if (err) throw err;
      console.log("table created");
    });
  });
};

// check if the user name exists in the table. Returns true or false
const userExists = (name: string) => {
  return new Promise((resolve, reject) => {
    con.connect(function (err) {
      if (err) throw err;
      const sql = `SELECT name FROM users WHERE name = '${name}'`;
      con.query(sql, function (err, result) {
        if (err) return false;
        console.log(result);
        if (Array.isArray(result) && result.length === 0) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  });
};

//validates the login user based on signature from private key and saved public key of the user
const validateSignature = (
  data: string,
  userName: string,
  signature: string
) => {
  //   var signer = crypto.createSign("RSA-SHA256");
  //   signer.update(stringifiedJSONOfStats);
  //   var sign = signer.sign(privateKey, "base64");

  //   assuming signature is made with the above given code block, we try to validate with the below function
  return new Promise((resolve, reject) => {
    let userPublicKey = null;
    let userDetails = [];
    const sql = `SELECT name, age, city, total_distance_run, public_key FROM users WHERE name = '${userName}'`;
    try {
      con.query(sql, function (err, result) {
        if (err) throw err;
        if (Array.isArray(result) && result.length === 1) {
          userPublicKey = result[0]["public_key"];
          console.log(userPublicKey);
          // verifying
          let verifier = crypto.createVerify("RSA-SHA256");
          verifier.update(Buffer.from(data, "base64").toString());
          let verified = verifier.verify(userPublicKey, signature, "base64");
          console.log(verified); // verified or not
          if (verified) {
            console.log(result);
            userDetails = result;
            resolve(userDetails);
          } else {
            resolve(userDetails);
          }
        }
      });
    } catch (e) {
      console.log(e);
      resolve(userDetails);
    }
  });
};

app.post("/signup", async function (req: Request, res: Response) {
  const { name, age, city } = req.body;
  const validName = namePattern.test(name);
  const validAge = agePattern.test(age);
  const validCity = cityPattern.test(city);

  if (validName && validAge && validCity) {
    console.log("inputs are valid");
    try {
      const { privateKey, publicKey } = generateKeyPair();
      let userExist = await userExists(name);
      if (userExist) {
        return res
          .status(403)
          .send(
            "User with this name already exists. Please add a unique identifier to your name. You can try by adding your middle name as well or a number after you name."
          );
      } else {
        const sql = `INSERT INTO users (name, age, city, total_distance_run, public_key) values ('${name}', '${age}', '${city}', 0, '${publicKey}')`;
        // console.log(sql);
        con.query(sql, function (err, result) {
          if (err) throw err;
          console.log("user added successfully", publicKey);
          // insert into a log table as well the success msg
          return res.json({ privateKey: privateKey });
        });
      }
    } catch (e) {
      console.error(e, e.stack);
      // ideally insert error to a log table
      return res.status(500).send("Internal server error");
    }
  } else {
    return res.status(422).send("Invalid inputs. Please insert valid inputs");
  }
});
//refer to suggestionNote.md for suggestions regarding scaling up in spikes
app.post("/update", async function (req: Request, res: Response) {
  const { request } = req.body;
  // splitting the stats and signature
  const [encodedStats, signature] = request.split(".");
  console.log(encodedStats);
  //base 64 to json
  const stats = JSON.parse(Buffer.from(encodedStats, "base64").toString());

  console.log(stats, stats.name, signature);

  //returns user object in array if valid else empty array
  let validatedUser = await validateSignature(
    encodedStats,
    stats.name,
    signature
  );

  if (Array.isArray(validatedUser) && validatedUser.length > 0) {
    con.query(
      `UPDATE users SET total_distance_run = total_distance_run + ${stats.distance} WHERE name = '${stats.name}'`,
      function (err, result) {
        if (err) {
          console.log(err);
          return res.status(500).json({ totalDistanceRun: -1 });
        }
        res.json({
          totalDistanceRun:
            validatedUser[0].total_distance_run + stats.distance,
        });
      }
    );
  } else {
    return res.status(400).send("user validation failed");
  }
});

app.post("/mystats", async function (req: Request, res: Response) {
  const { request } = req.body;
  const [encodedStats, signature] = request.split(".");
  console.log(signature, encodedStats);
  const stats = JSON.parse(Buffer.from(encodedStats, "base64").toString());

  console.log(stats, stats.name, signature);

  let validatedUser = await validateSignature(
    encodedStats,
    stats.name,
    signature
  );
  if (Array.isArray(validatedUser) && validatedUser.length > 0) {
    let sqlQuery = "";
    if (stats.type === "city") {
      sqlQuery = `SELECT u.name, u.total_distance_run,
      (SELECT COUNT(DISTINCT u2.total_distance_run) + 1 
       FROM users u2 
       WHERE u2.city = u.city AND u2.total_distance_run > u.total_distance_run) AS rnk
        FROM users u
         WHERE u.name = '${stats.name}' AND u.city = '${validatedUser[0].city}'`;
    } else if (stats.type === "age") {
      sqlQuery = `SELECT u.name, u.total_distance_run,
      (SELECT COUNT(DISTINCT u2.total_distance_run) + 1 
       FROM users u2 
       WHERE u2.age = u.age AND u2.total_distance_run > u.total_distance_run) AS rnk
        FROM users u
        WHERE u.name = '${stats.name}' AND u.age = ${validatedUser[0].age};`;
    } else if (stats.type === "overall") {
      sqlQuery = `SELECT u.name, u.total_distance_run,
      (SELECT COUNT(DISTINCT u2.total_distance_run) + 1 
       FROM users u2 
       WHERE u2.total_distance_run > u.total_distance_run) AS rnk
        FROM users u
        WHERE u.name = '${stats.name}'`;
    } else {
      res.status(403).send("Invalid status option provided");
    }
    con.query(sqlQuery, function (error, result) {
      if (error) {
        console.log(error);
        return res.json({ ranking: -1 });
      }
      res.json({ ranking: result[0]["rnk"] });
    });
  } else {
    return res.status(400).send("user validation failed");
  }
});

const PORT = 9001;
app.listen(PORT, () => {
  try {
    createTable();
  } catch (e) {
    console.log(e);
  }
  console.log(`Server running on port ${PORT}`);
});
