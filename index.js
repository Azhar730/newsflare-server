const express = require('express')
const app = express()
const cors = require('cors')
const jwt = require('jsonwebtoken')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
require('dotenv').config()
// const nodemailer = require("nodemailer");
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000

app.use(cors())
app.use(express.json())


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.apuyeda.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {

        const db = client.db("NewsFlare")
        const userCollection = db.collection("users")
        const publisherCollection = db.collection("publishers")
        const articleCollection = db.collection("articles")
        const subscribeCollection = db.collection("subscribe")

        //jwt related apis
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '1h'
            })
            res.send({ token })
        })

        //middlewares
        const verifyToken = (req, res, next) => {
            console.log('inside verify token', req.headers.authorization);
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'unauthorized access' })
            }
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'unauthorized access' })
                }
                req.decoded = decoded;
                next()
            })
        }

        //use verify admin after verify token
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next()
        }

        //user related api
        app.post('/users', async (req, res) => {
            const user = req.body
            const query = { email: user.email }
            const existingUser = await userCollection.findOne(query)
            if (existingUser) {
                return res.send({ message: 'User Already Exists', inserted: null })
            }
            const result = await userCollection.insertOne(user)
            res.send(result)
        })
        //get all users
        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const result = await userCollection.find().toArray()
            res.send(result)
        })
        //delete a user
        app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await userCollection.deleteOne(query)
            res.send(result)
        })
        //check admin or not
        app.get('/users/admin/:email', verifyToken, verifyAdmin, async (req, res) => {
            const email = req.params.email
            if (email !== req.decoded.email) {
                return res.status(403).send({ message: "forbidden access" })
            }
            const query = { email: email };
            const user = await userCollection.findOne(query);
            let admin = false
            if (user) {
                admin = user?.role === 'admin'
            }
            res.send({ admin })
        })

        //for making admin
        app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await userCollection.updateOne(filter, updatedDoc)
            res.send(result)
        })

        //save a publisher data in db
        app.post('/publisher', async (req, res) => {
            const publisherInfo = req.body
            const result = await publisherCollection.insertOne(publisherInfo)
            res.send(result)
        })
        //get all publisher
        app.get('/publisher', async (req, res) => {
            const result = await publisherCollection.find().toArray()
            res.send(result)
        })
        //save a article data in db
        app.post('/article', async (req, res) => {
            const articleInfo = req.body
            const result = await articleCollection.insertOne(articleInfo)
            res.send(result)
        })
        //get all article data from db
        app.get('/article', async (req, res) => {
            const result = await articleCollection.find().toArray()
            res.send(result)
        })

        // Get all article data from db for search & sort
        app.get('/allArticle', async (req, res) => {
            const search = req.query.search
            let query = {
                title: { $regex: search, $options: 'i' },
            }
            let options = {}
            const result = await articleCollection
                .find(query, options).toArray()
            res.send(result)
        })
        //update article status
        app.patch('/article/:id', async (req, res) => {
            const id = req.params.id;
            const status = req.body;
            const isPremium = req.body
            const query = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: { ...status, ...isPremium }
            }
            const result = await articleCollection.updateOne(query, updateDoc)
            res.send(result)
        })
        //get specific an article data from db
        app.get('/article/:id', async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await articleCollection.findOne(query)
            res.send(result)
        })
        //delete an article from db
        app.delete('/article/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await articleCollection.deleteOne(query)
            res.send(result)
        })
        // update article data
        app.put('/article/update/:id', verifyToken, async (req, res) => {
            const id = req.params.id
            const articleData = req.body
            const query = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: articleData,
            }
            const result = await articleCollection.updateOne(query, updateDoc)
            res.send(result)
        })
        //get my article
        app.get('/my-articles/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const query = { 'author.email': email }
            const result = await articleCollection.find(query).toArray()
            res.send(result)
        })
        //save a subscribe data in db
        app.post('/subscribe', async (req, res) => {
            const subscribeInfo = req.body
            const result = await subscribeCollection.insertOne(subscribeInfo)
            res.send(result)
        })

        // payment intent
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            console.log(amount, 'amount inside the intent')

            const paymentIntent = await stripe.paymentIntents.create({
                amount,
                currency: 'usd',
                payment_method_types: ['card']
            });

            res.send({
                clientSecret: paymentIntent.client_secret
            })
        });

        //save payment in the database
        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const paymentResult = await paymentCollection.insertOne(payment);
            //  carefully delete each item from the cart
            const query = {
                _id: {
                    $in: payment.cartIds.map(id => new ObjectId(id))
                }
            };
            const deleteResult = await cartCollection.deleteMany(query);
            res.send({ paymentResult, deleteResult });
        })
        // get payment history from db
        app.get('/payments/:email', verifyToken, async (req, res) => {
            const query = { email: req.params.email }
            if (req.params.email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            const result = await paymentCollection.find(query).toArray()
            res.send(result)
        })

        // using aggregate pipeline
        app.get('/order-stats', async (req, res) => {
            const result = await articleCollection.aggregate([
                {
                    $unwind: '$publisher'
                },
                {
                    $group: {
                        _id: '$publisher',
                        quantity: { $sum: 1 },
                    }
                },
                {
                    $project: {
                        _id: 0,
                        publisher: '$_id',
                        quantity: '$quantity',
                    }
                }
            ]).toArray();

            res.send(result);

        })

        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Hello from NewsFlare Server..')
})

app.listen(port, () => {
    console.log(`NewsFlare is running on port ${port}`)
})
