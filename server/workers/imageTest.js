//! ==== TESTING IMAGE RECOVERY LOGIC ====

// const { spawn } = require("child_process");
// const fs = require("fs");

// let minute = new Date().getMinutes();
// let failed = 0;

// setInterval(() => {
//     const now = new Date().getMinutes();
//     const second = new Date().getSeconds()
//     if (now !== minute) {
//         console.log("Inside main function")

//         minute = now;
//         const imagePath = `C:/snaps/${minute}_${second}.jpg`;
//         const result = spawn("cmd.exe", ["/c", "ReadImage_recovered_5.exe", "192.168.0.28", imagePath], { cwd: __dirname, stdio: "inherit" });
//         // if exe failed failed = 1 else 0

//         result.on("error", (err) => {
//             console.error("Failed to start process:", err);
//         });

//         result.on("close", (code, signal) => {
//             if (signal) {
//                 console.error("EXE terminated by signal:", signal);
//                 failed = 1;
//                 return;
//             }

//             if (code !== 0) {
//                 console.error("EXE failed with exit code:", code);
//                 failed = 1;
//                 return;
//             }

//             if (fs.existsSync(imagePath)) {
//                 console.log("Image created:", imagePath);
//                 failed = 0;
//             }
//             else {
//                 console.error("EXE run but image was not created:", imagePath);
//                 failed = 1;
//             }
//         });

//     }

//     if (failed !== 0) {
//         failed += 1;

//         if (failed > 21) {

//             console.log("Inside retry function");
//             failed = 0;

//             minute = 0xff;
//         }
//     }
// }, 1000);



//! ==== SHARPT LIBRARY TESTING ====

const fs = require('fs/promises');
const sharp = require('sharp');

// EXTRACTING IMAGE DIMENSIONS
async function getImageDimensions(buffer) {
    try {
        const metadata = await sharp(buffer).metadata();

        return {
            width: metadata.width,
            height: metadata.height,
            aspectRatio: metadata.width / metadata.height, // Calculate: width/height  
            format: metadata.format
        };
    } catch (error) {
        console.error('Error extracting metadata:', error.message);
        throw error; // Re-throw to handle upstream  
    }
}

// EXTRACTING IMAGE SIZE IN MB
async function getImageSize(buffer) {
    try {
        const fileSizeInBytes = buffer.length;
        const fileSizeInKB = (fileSizeInBytes / (1024)).toFixed(2);
        const fileSizeInMB = (fileSizeInBytes / (1024 * 1024)).toFixed(2);

        return {
            fileSize: {
                bytes: fileSizeInBytes,
                kb: parseFloat(fileSizeInKB),
                mb: parseFloat(fileSizeInMB)
            }
        }
    } catch (error) {
        console.error('Error extracting image info:', error.message);
        throw error;
    }
}


// MAIN FUNCTION: READING IMAGE METADATA
async function main() {
    const imageBuffer = await fs.readFile('testing_recovery4.jpg');
    const dimensions = await getImageDimensions(imageBuffer);

    const imageSize = await getImageSize(imageBuffer);
    console.log('Image Dimensions:', dimensions);
    console.log("File Size:", imageSize.fileSize.kb);

    if (imageSize.fileSize.kb < 50) {
        console.log("File Size is Invalid");
    } else {
        console.log("Valid file size");
    }
    // Output: { width: 1920, height: 1080, aspectRatio: 1.777..., format: 'jpeg' }  
}

main();  