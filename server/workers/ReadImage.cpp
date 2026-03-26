#include <iostream>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>      // for usleep(), close()
#include <arpa/inet.h>   // for inet_pton()
#include <sys/socket.h>  // for socket APIs
#include <pthread.h>     // for threading
#include <fcntl.h>
#include <time.h>
#include <ctype.h>

// Timer tick in milliseconds
#define TIMER_TICK 10

// Global control flag for program execution
unsigned short run_flag = 1

// Socket descriptor for camera connection
int sckConnImg = -1;

// Structure to hold server (camera) address
struct sockaddr_in sockinImg;

// Thread handlers
pthread_t kb_thread, tmr_thread;


// Timer Thread
// Decreases run_flag periodically → acts like timeout
void* tmr_handler(void* arg)
{
    while (run_flag)
    {
        usleep(TIMER_TICK * 1000);

        // Decrement run_flag until it reaches 0
        if (run_flag) run_flag--;
    }
    usleep(100000);
    return NULL;
}


// Keyboard Thread
// Allows manual termination using 'Q'
void* kb_handler(void* arg)
{
    printf("\nStarting KB handler\n");
    while (run_flag)
    {
        int ch = getchar(); // blocking input

        // If user presses 'Q' or 'q', stop program
        if (toupper(ch) == 'Q')
        {
            run_flag = 0;
            return NULL;
        }
        usleep(100000);
    }
    return NULL;
}


// Establish TCP connection to camera
void ConnectImage(const char* remoteip)
{
    // Camera port
    int dest_port = 8324;

    // Validate IP
    if (!remoteip || strlen(remoteip) < 5)
    {
        printf("\nError: Invalid IP\n");
        return;
    }

    // Create TCP socket
    sckConnImg = socket(AF_INET, SOCK_STREAM, 0);
    if (sckConnImg < 0)
    {
        perror("socket failed");
        return;
    }

    // Clear and setup address structure
    memset(&sockinImg, 0, sizeof(sockinImg));
    sockinImg.sin_family = AF_INET;
    sockinImg.sin_port = htons(dest_port);

    // Convert IP string to binary
    inet_pton(AF_INET, remoteip, &sockinImg.sin_addr);

    // Connect to camera
    if (connect(sckConnImg, (struct sockaddr*)&sockinImg, sizeof(sockinImg)) < 0)
    {
        printf("\nNot able to connect to %s:%d\n", remoteip, dest_port);
        return;
    }
}


// Generate filename using timestamp
void get_timestamp_filename(char* buffer, size_t buffer_size)
{
    time_t raw_time;
    struct tm* time_info;

    time(&raw_time);
    time_info = localtime(&raw_time);

    // Format: YYYYMMDD_HHMMSS.jpeg
    strftime(buffer, buffer_size, "%Y%m%d_%H%M%S.jpeg", time_info);
}


// Global filename buffer
char filename[100];


// Save received image to file
void save_image(unsigned char* img_data, unsigned long img_size)
{
    printf("Attempting to save: %s\n", filename);

    // Open file in binary write mode
    FILE* fp = fopen(filename, "wb");

    // Error handling if file cannot be created
    if (!fp)
    {
        perror("fopen failed");
        printf("Path: %s\n", filename);
        return;
    }

    // Write image data
    fwrite(img_data, 1, img_size, fp);
    fclose(fp);

    printf("Saved successfully: %s (%lu bytes)\n", filename, img_size);
}


// Receive JPEG image from camera
void recv_jpeg(void)
{
    // First 8 bytes = image size
    const int HEADER_SIZE = 8;
    // Safety limit (230 KB)
    const int MAX_IMAGE_SIZE = 230 * 1024;

    char header[HEADER_SIZE + 1] = {0};
    int header_received = 0;
    int image_size = 0;
    int image_received = 0;
    unsigned char* image_buffer = NULL;

    printf("\nPhase 1: Waiting for header...\n");

    // Step 1: Receive header (image size)
    while (header_received < HEADER_SIZE)
    {
        int n = recv(sckConnImg, header + header_received, HEADER_SIZE - header_received, 0);
        if (n <= 0)
        {
            perror("recv header failed");
            return;
        }
        header_received += n;
    }

    // Convert header string to integer
    header[HEADER_SIZE] = '\0';
    image_size = atoi(header);

    printf("Image size: %d\n", image_size);

    // Validate size
    if (image_size <= 0 || image_size > MAX_IMAGE_SIZE)
    {
        printf("Invalid image size\n");
        return;
    }

    // Step 2: Allocate buffer for image
    image_buffer = (unsigned char*)malloc(image_size);
    if (!image_buffer)
    {
        printf("Memory allocation failed\n");
        return;
    }

    printf("Receiving image...\n");

    // Step 3: Receive image data
    while (image_received < image_size)
    {
        int n = recv(sckConnImg, image_buffer + image_received, image_size - image_received, 0);
        if (n <= 0) break;
        image_received += n;
    }

    // Step 4: Save image
    if (image_received > 0)
    {
        printf("Received %d bytes\n", image_received);
        save_image(image_buffer, image_received);
    }

    // Cleanup
    free(image_buffer);

    // Stop main loop after one image
    run_flag = 0;
}

int main(int argc, char* argv[])
{
    printf("\nRead Image : Press Q to terminate at any time\n");

    // Check input arguments
    if (argc < 2)
    {
        printf("Usage: ./ReadImage <ip>\n");
        return 1;
    }

    // Initialize run flag (acts as timeout counter)
    run_flag = 200;

    // Start keyboard + timer threads
    pthread_create(&kb_thread, NULL, kb_handler, NULL);
    pthread_create(&tmr_thread, NULL, tmr_handler, NULL);

    // get_timestamp_filename(filename, sizeof(filename));

    // Filename handling
	if (argc >= 3) {

        // Use filename provided by external program (Node.js)
        strncpy(filename, argv[2], sizeof(filename) - 1);
        filename[sizeof(filename) - 1] = '\0';
    } else {
        // Auto-generate filename
        get_timestamp_filename(filename, sizeof(filename));
    }

    printf("Filename: %s\n", filename);

    // Connect to camera
    ConnectImage(argv[1]);

    int ticker = 0;

    // Main execution loop
    while (run_flag)
    {
        // If socket is valid, receive image
        if (sckConnImg >= 0)
        {
            recv_jpeg();
        }

        usleep(10000);

        // Print heartbeat indicator
        if (ticker++ > 10)
        {
            printf(".");
            fflush(stdout);
            ticker = 0;
        }
    }

    // Close socket
    close(sckConnImg);

    // allow cleanup
    usleep(100000);

    return 0;
}