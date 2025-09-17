const express = require('express');
const app = express();
const path = require('path');
const bodyP = require('body-parser');
const { error } = require('console');
const port = 5000;
const mongoose = require('mongoose');
const multer = require('multer');
const fs = require('fs');
const { json } = require('stream/consumers');
const internship = require('./internships.json')
//const { sendRecommendationEmail } = require('./mailer'); // Make sure this path is correct

// Corrected import statement for the JSON file
//import internship from './internships.json' with { type: 'json' };
// Add this near the top of your index.js file
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
// Add this after your other 'require' statements
const session = require('express-session');
require('dotenv').config()
// ... other middleware ...

app.use(session({
    secret: '1x2d5v', // Use a strong, unique secret key
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set to true if you are using HTTPS
}));
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/");
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + "-" + file.originalname);
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (path.extname(file.originalname) === '.json') {
            cb(null, true);
        } else {
            cb(new Error("Only JSON files are allowed"));
        }
    },
});

app.use(express.json());

mongoose.connect('mongodb://localhost:27017/Hackathon')
    .then(() => console.log("Database connected successfully!!"))
    .catch((e) => console.error("Error connecting to DB:", e));

const userSchema = new mongoose.Schema({
    username: String,
    email: String,
    skill1: String,
    skill2: String,
    skill3: String,
    address: String,
    qualification: String,
    jobPrefLocation: String,
    experience: String,
    category: String
});

const usermodel = new mongoose.model('usermodel', userSchema);

const internshipSchema = new mongoose.Schema({
    id: String,
    title: String,
    field: String,
    location: String
});

const internshipModel = new mongoose.model('internshipModel', internshipSchema);

app.use(bodyP.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.send("Hello developer");
});

// ... (in your index.js file) ...
// A middleware function to check for authenticated users
function isAuthenticated(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login'); // Redirect to login if not authenticated
    }
}

// Update your dashboard route to use the middleware
app.get('/dashboard', isAuthenticated, async (req, res) => {
    try {
        const userEmail = req.session.user.email;
        const user = await usermodel.findOne({ email: userEmail });
        
        // ... (the rest of your recommendation logic remains the same) ...

        const userRecommendations = [];
        const userSkills = [user.skill1, user.skill2, user.skill3].filter(s => s).map(s => s.toLowerCase().trim());

        for (const currentInternship of internship) {
            let totalScore = 0;

            let skillScore = 0;
            if (currentInternship.required_skills && Array.isArray(currentInternship.required_skills)) {
                const internshipSkills = currentInternship.required_skills.map(s => s.toLowerCase().trim());
                const matchingSkills = userSkills.filter(userSkill => internshipSkills.includes(userSkill));
                if (matchingSkills.length > 0) {
                    skillScore = 40;
                }
            }
            totalScore += skillScore;

            const distance = await calculateDistance(user.jobPrefLocation, currentInternship.location);
            const distanceScore = (distance < 100) ? 20 : 0;
            totalScore += distanceScore;

            let qualificationScore = 0;
            if (user.qualification) {
                const q = user.qualification.toLowerCase();
                if (q.includes("12")) qualificationScore = 15;
                else if (q.includes("ug")) qualificationScore = 20;
                else if (q.includes("pg")) qualificationScore = 25;
            }
            totalScore += qualificationScore;

            let experienceScore = 0;
            if (user.experience) {
                const exp = parseFloat(user.experience);
                if (!isNaN(exp)) experienceScore = (exp < 2) ? 12 : 20;
            }
            totalScore += experienceScore;

            const formattedDistance = (typeof distance === 'number' && !isNaN(distance) && isFinite(distance)) ?
                distance.toFixed(2) + " km" : "N/A";

            userRecommendations.push({
                internshipId: currentInternship.internship_id,
                title: currentInternship.title,
                sector: currentInternship.sector,
                location: currentInternship.location,
                scores: { skillScore, distanceScore, qualificationScore, experienceScore },
                totalScore,
                distance: formattedDistance,
            });
        }

        userRecommendations.sort((a, b) => b.totalScore - a.totalScore);
        const topRecommendations = userRecommendations.slice(0, 5);

        res.render('dashboard', { user, recommendations: topRecommendations });

    } catch (error) {
        console.error("Error loading dashboard:", error);
        res.status(500).send("Error loading dashboard.");
    }
});
app.post('/login', async (req, res) => {
    const { email } = req.body;
    const user = await usermodel.findOne({ email });

    if (!user) {
        return res.status(404).send('User not found.');
    }

    // Set the user's email in the session
    req.session.user = { email: user.email }; 
    
    // Redirect to the dashboard
    res.redirect('/dashboard');
});
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).send('Could not log out.');
        }
        res.redirect('/'); // Redirect to the homepage or login page
    });
});

app.post('/user-registration', async (req, res) => {
    let email = req.body.email;
    let duplicacy = await usermodel.findOne({ email: email });
    if (duplicacy) {
        return res.json({ message: "You are registered previously!!", statuscode: 400 });
    }
    let user = new usermodel({
        username: req.body.uname,
        email: req.body.email,
        category: req.body.category,
        address: req.body.address,
        skill1: req.body.skill1,
        skill2: req.body.skill2,
        skill3: req.body.skill3,
        jobPrefLocation: req.body.jobPrefLocation,
        experience: req.body.experience
    });
    user.save().then(() => {
        res.json({ message: "Data saved!! Thanks for registration. Our team will notify you if there will an internship for you.", statuscode: 200 });
    }).catch((e) => {
        res.json({ message: "Oops!! There some error occured in registering you. Please try again!!", statuscode: 400 });
    });
});

app.post('/upload-internship-file', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: "File not uploaded" });
    }
    fs.readFile(req.file.path, "utf-8", (err, data) => {
        if (err) {
            return res.status(400).json({ message: "Error in reading file" });
        }
        try {
            const jsondata = JSON.parse(data);
            res.json({ message: "File uploaded successfully", data: jsondata });
        } catch (error) {
            res.status(400).json({ message: "Invalid JSON format" });
        }
    });
});

app.post('/upload-internship-details', async (req, res) => {
    let id = req.body.id;
    let duplicacy = await internshipModel.findOne({ id: id });
    if (duplicacy) {
        return res.json({ message: "Internship registered previously!", statuscode: 400 });
    }
    let file = new internshipModel({
        id: req.body.id,
        title: req.body.title,
        field: req.body.field,
        location: req.body.location
    });

    file.save().then(() => {
        res.json({ message: "Internship registered successfully!!" });
    }).catch((e) => {
        res.json({ message: e, statuscode: 400 });
    });
});

// Function to convert degrees to radians
function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

// Haversine formula to calculate the distance between two lat-lon points
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distance in km
    return distance;
}

async function getCoordinates(city, country = 'India') {
    try {
        const url = new URL('https://nominatim.openstreetmap.org/search');
        url.searchParams.append('q', `${city},${country}`);
        url.searchParams.append('format', 'json');
        url.searchParams.append('limit', '1');

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'DistanceCalculator/1.0 (aakarshm826@gmail.com)', // Required by Nominatim
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch coordinates: ${response.statusText}`);
        }

        const data = await response.json();
        if (data.length === 0) {
            throw new Error(`Could not find coordinates for ${city}`);
        }

        return {
            lat: parseFloat(data[0].lat),
            lon: parseFloat(data[0].lon),
        };
    } catch (error) {
        console.error(`Error fetching coordinates for ${city}: ${error.message}`);
        return null; // Return null on error
    }
}

async function calculateDistance(city1, city2) {
    try {
        const loc1 = await getCoordinates(city1);
        const loc2 = await getCoordinates(city2);

        if (!loc1 || !loc2) {
            console.error(`Could not get coordinates for one or both cities: ${city1}, ${city2}`);
            return Infinity; // Return a high value if coordinates can't be found
        }

        return calculateHaversineDistance(loc1.lat, loc1.lon, loc2.lat, loc2.lon);
    } catch (error) {
        console.error(`Error in calculating distance: ${error.message}`);
        return Infinity; // Return a high value on error
    }
}

app.post('/recommend-internships', async (req, res) => {
    try {
        const users = await usermodel.find();

        if (!users || users.length === 0) {
            return res.status(404).json({ message: "No users found" });
        }

        if (!internship || internship.length === 0) {
            return res.status(404).json({ message: "No internships found" });
        }

        const allRecommendations = [];

        for (const user of users) {
            const userRecommendations = [];
            const userSkills = [user.skill1, user.skill2, user.skill3].filter(s => s).map(s => s.toLowerCase().trim());

            for (const currentInternship of internship) {
                let totalScore = 0;

                // ---------- a. Skill Score (40 points max) ----------
                let skillScore = 0;
                if (currentInternship.required_skills && Array.isArray(currentInternship.required_skills)) {
                    const internshipSkills = currentInternship.required_skills.map(s => s.toLowerCase().trim());
                    const matchingSkills = userSkills.filter(userSkill => internshipSkills.includes(userSkill));
                    if (matchingSkills.length > 0) {
                        skillScore = 40;
                    }
                }
                totalScore += skillScore;

                // ---------- b. Distance Score (20 points max) ----------
                let distanceScore = 0;
                const distance = await calculateDistance(user.jobPrefLocation, currentInternship.location);
                if (distance < 100) {
                    distanceScore = 20;
                }
                totalScore += distanceScore;

                // ---------- c. Other Scores ----------
                // Qualification Score
                let qualificationScore = 0;
                if (user.qualification) {
                    const q = user.qualification.toLowerCase();
                    if (q.includes("12")) {
                        qualificationScore = 15;
                    } else if (q.includes("ug")) {
                        qualificationScore = 20;
                    } else if (q.includes("pg")) {
                        qualificationScore = 25;
                    }
                }
                totalScore += qualificationScore;

                // Experience Score
                let experienceScore = 0;
                if (user.experience) {
                    const exp = parseFloat(user.experience);
                    if (!isNaN(exp)) {
                        experienceScore = exp < 2 ? 12 : 20;
                    }
                }
                totalScore += experienceScore;

                // Check if distance is a valid number before using it
                const formattedDistance = typeof distance === 'number' && !isNaN(distance) && isFinite(distance) ?
                    distance.toFixed(2) + " km" :
                    "N/A";

                userRecommendations.push({
                    internshipId: currentInternship.internship_id,
                    title: currentInternship.title,
                    sector: currentInternship.sector,
                    location: currentInternship.location,
                    userEmail: user.email,
                    scores: {
                        skillScore,
                        distanceScore,
                        qualificationScore,
                        experienceScore
                    },
                    totalScore,
                    distance: formattedDistance,
                });
            }

            // Sort recommendations for the current user by total score descending
            userRecommendations.sort((a, b) => b.totalScore - a.totalScore);
            const topRecommendations = userRecommendations.slice(0, 5); // Get top 5 recommendations

            // If there are recommendations, send an email (assuming you have mailer.js set up)
            if (topRecommendations.length > 0) {
                // Uncomment the line below after you have set up mailer.js
                // await sendRecommendationEmail(user.email, topRecommendations);
            }

            allRecommendations.push({
                userEmail: user.email,
                recommendations: topRecommendations,
            });
        }

        res.json({
            message: "Recommendations generated and emails sent to users",
            recommendations: allRecommendations,
        });
    } catch (error) {
        console.error("Error generating recommendations:", error);
        res.status(500).json({ message: "Error generating recommendations", error: error.message });
    }
});

app.listen(port, (error) => {
    if (!error) {
        console.log("App is listening on port 5000");
    } else {
        console.error(`Error ${error}`);
    }
});