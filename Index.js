const express = require('express')
const app = express();
const path = require('path');
const bodyP = require('body-parser');
const { error } = require('console');
const port = 5000;
const mongoose = require('mongoose');
const multer=require('multer');
const fs=require('fs');
const { json } = require('stream/consumers');
import internship from './internships.json';

const storage=multer.diskStorage({
    destination:(req,file,cb)=>{
        cb(null,"uploads/")
    },
    filename:(req,file,cb)=>{
        cb(null,Date.now()+"-"+file.originalname)
    }
})

const upload=multer({
    storage:storage,
    fileFilter:(req,file,cb)=>{
        if (path.extname(file.originalname)==='.json') {
            cb(null,true);
        }
        else{
            cb(new Error("Only JSON files are allowed"))
        }
    },
})
app.use(express.json());

mongoose.connect('mongodb://localhost:27017/Hackathon')
  .then(() => console.log("Database connected successfully!!"))
  .catch((e) => console.error("Error connecting to DB:", e));

const userSchema = new mongoose.Schema({
    username: String,
    email: String,
    skill1:String,
    skill2:String,
    skill3:String,
    address: String,
    qualification:String,
    jobPrefLocation: String,
    experience: String,
    category: String
})

const usermodel = new mongoose.model('usermodel', userSchema);

const internshipSchema = new mongoose.Schema({
    id:String,
    title: String,
    field: String,
    location: String
})

const internshipModel=new mongoose.model('internshipModel',internshipSchema);

app.use(bodyP.urlencoded({ extended: true }));


app.get('/', (req, res) => {
    res.send("Hello developer");
})

app.post('/user-registration', async (req, res) => {
    let email= await req.body.email;
    let duplicacy=await usermodel.findOne({email:email});
    if (duplicacy) {
        res.json({message:"You are registered previously!!",statuscode:400})
        return;
    }
    let user = new usermodel({
        username: req.body.uname,
        email: req.body.email,
        category: req.body.category,
        address: req.body.address,
        skill1:req.body.skill1,
        skill2:req.body.skill2,
        skill3:req.body.skill3,
        jobPrefLocation: req.body.jobPrefLocation,
        experience: req.body.experience
    });
    await user.save().then(() => { res.json({ message: "Data saved!! Thanks for registration. Our team will notify you if there will an internship for you.", statuscode: 200 }) }).catch((e) => { res.json({ message: "Oops!! There some error occured in registering you. Please try again!!", statuscode: 400 }) })


})

app.post('/upload-internship-file',upload.single('file'),  (req, res) => {
   if (!req.file) {
        return res.status(400).json({message:"File not uploaded"})
   }
   fs.readFile(req.file.path,"utf-8",(err,data)=>{
    if (err) {
        return res.status(400).json({message:"Error in reading file"});
    }
    try {
        const jsondata=JSON.parse(data);
        res.json({ message: "File uploaded successfully", data: jsondata });
    } catch (error) {
         res.status(400).json({ message: "Invalid JSON format" });
    }
   })
})

app.post('/upload-internship-details',async (req, res) => {
     let id=await req.body.id;
    let duplicacy=await internshipModel.findOne({id:id});
    if (duplicacy) {
        res.json({message:"Internship registered previously!",statuscode:400})
        return;
    }
    let file=new internshipModel({
        id:req.body.id,
        title:req.body.title,
        field:req.body.field,
        location:req.body.location
    })

    await file.save().then(()=>{res.json({message:"Internship registered successfully!!"})}).catch((e)=>{res.json({message:e,statuscode:400})})
})

let city1,city2;

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
    throw new Error(`Error fetching coordinates for ${city}: ${error.message}`);
  }
}

function calculateDistance(city1,city2) {
try {
       let loc1= getCoordinates(city1);
   let loc2= getCoordinates(city2);
   let resLat=loc1.lat-loc2.lat;
   let resLon=loc1.lan-loc2.lan;
   return {
    lat:parseFloat(resLat),
    lon:parseFloat(resLon)
   }
} catch (error) {
    throw new Error(`Error in calculating distance ${error.message}`);
    
}
}
// getCoordinates('Aurangabad').then((data)=>{console.log(`Data ${data.lat} + ${data.lon}`);
// })

//main logic goes here
/*app.post('/recommend-internships', async (req, res) => {
  try {
    // Fetch user by email (or any identifier passed in req.body)
    const user = await usermodel.find();
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Fetch all internships
    const internships = await internshipModel.find();

    const recommendations = [];

    for (let internship of internships) {
      // ---------- Distance Score ----------
      const distance = await calculateDistance(user.jobPrefLocation, internship.location);
      let distanceScore = distance < 50 ? 20 : 0;

      // ---------- Skill Score ----------
      let skillScore = 0;
      if (internship.skills && Array.isArray(internship.skills)) {
        const userSkills = [user.skill1, user.skill2, user.skill3].map(s => s?.toLowerCase().trim());
        const internshipSkills = internship.skills.map(s => s?.toLowerCase().trim());

        const hasMatch = userSkills.some(skill => internshipSkills.includes(skill));
        if (hasMatch) {
          skillScore = 40;
        }
      }

      // ---------- Qualification Score ----------
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

      // ---------- Experience Score ----------
      let experienceScore = 0;
      if (user.experience) {
        const exp = parseFloat(user.experience); // assuming string like "1.5" or number
        if (!isNaN(exp)) {
          experienceScore = exp < 2 ? 12 : 20;
        }
      }

      // ---------- Total Score ----------
      const totalScore = distanceScore + skillScore + qualificationScore + experienceScore;

      // ---------- Final recommendation object ----------
      recommendations.push({
        internshipId: internship.id,
        title: internship.title,
        field: internship.field,
        location: internship.location,
        distance: `${distance} km`,
        distanceScore,
        skillScore,
        qualificationScore,
        experienceScore,
        totalScore
      });
    }

    // Sort by totalScore descending (highest match first)
    recommendations.sort((a, b) => b.totalScore - a.totalScore);

    res.json({
      message: "Recommendations generated",
      recommendations
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error generating recommendations", error: error.message });
  }
});*/

app.post('/recommend-internships',async(req,res)=>{
  let users=await usermodel.find();
 
  let x=await usermodel.countDocuments({});
  let distanceScore=0,qualificationScore=0,skillScore=0,categoryScore=0,experienceScore=0;
  let totalScore=new Array(x);
  users.forEach(user => {
    for (let i = 0; i < internship.length; i++) {
      for (let k = 0; k < x; k++) {
        if ((internship[i].location)==user[k].jobPrefLocation) {
        distanceScore+=20;
        totalScore.push({
          email:user[k].email,
          marks:distanceScore
        })
      }
        
      }
     
      for (let j = 0; j < internship.required_skills.length; j++) {
       for (let k = 0; k < x; k++) {
         if (internship[i].required_skills[j]==user[k].skill1) {
        skillScore+=40;
        totalScore.push({
          email:user[k].email,
          marks:
        })

      }
        
       }
        
      }
      
      
    }
  });
  
  //res.send(x)
})





app.listen(port, (error) => {
    if (!error) {
        console.log("App is listening on port 5000");

    } else {
        console.error(`Error ${error}`);

    }
});