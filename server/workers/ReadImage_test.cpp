#include <iostream>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <arpa/inet.h>
#include <sys/socket.h>
#include <pthread.h>
#include <fcntl.h>
#include <time.h>
#include <ctype.h>

#define TIMER_TICK 10

unsigned short run_flag = 1;

int sckConnImg = -1;
struct sockaddr_in sockinImg;

pthread_t kb_thread, tmr_thread;

int mode = 0; // 0 = normal, 1 = extra data, 2 = partial

//-----------------------------------
// Timer Thread
//-----------------------------------
void* tmr_handler(void* arg)
{
while (run_flag)
{
usleep(TIMER_TICK * 1000);
if (run_flag) run_flag--;
}
usleep(100000);
return NULL;
}

//-----------------------------------
// Keyboard Thread
//-----------------------------------
void* kb_handler(void* arg)
{
printf("\nStarting KB handler\n");

while (run_flag)
{
    int ch = getchar();

    if (toupper(ch) == 'Q')
    {
        run_flag = 0;
        return NULL;
    }
    else if (ch == '1')
    {
        printf("Mode: ADD DATA\n");
        mode = 1;
    }
    else if (ch == '2')
    {
        printf("Mode: PARTIAL DATA\n");
        mode = 2;
    }

    usleep(100000);
}
return NULL;

}

//-----------------------------------
// Connect to Camera
//-----------------------------------
void ConnectImage(const char* remoteip)
{
int dest_port = 8324;

if (!remoteip || strlen(remoteip) < 5)
{
    printf("\nError: Invalid IP\n");
    return;
}

sckConnImg = socket(AF_INET, SOCK_STREAM, 0);
if (sckConnImg < 0)
{
    perror("socket failed");
    return;
}

memset(&sockinImg, 0, sizeof(sockinImg));
sockinImg.sin_family = AF_INET;
sockinImg.sin_port = htons(dest_port);

inet_pton(AF_INET, remoteip, &sockinImg.sin_addr);

if (connect(sckConnImg, (struct sockaddr*)&sockinImg, sizeof(sockinImg)) < 0)
{
    printf("\nNot able to connect to %s:%d\n", remoteip, dest_port);
    return;
}

}

//-----------------------------------
// Filename generator
//-----------------------------------
void get_timestamp_filename(char* buffer, size_t buffer_size)
{
time_t raw_time;
struct tm* time_info;


time(&raw_time);
time_info = localtime(&raw_time);

strftime(buffer, buffer_size, "%Y%m%d_%H%M%S.jpeg", time_info);


}

char filename[100];

//-----------------------------------
// Save Image
//-----------------------------------
void save_image(unsigned char* img_data, unsigned long img_size)
{
printf("Attempting to save: %s\n", filename);


FILE* fp = fopen(filename, "wb");

if (!fp)
{
    perror("fopen failed");
    printf("Path: %s\n", filename);
    return;
}

fwrite(img_data, 1, img_size, fp);
fclose(fp);

printf("Saved successfully: %s (%lu bytes)\n", filename, img_size);


}

//-----------------------------------
// Receive JPEG
//-----------------------------------
void recv_jpeg(void)
{
const int HEADER_SIZE = 8;
const int MAX_IMAGE_SIZE = 230 * 1024;


char header[HEADER_SIZE + 1] = {0};
int header_received = 0;
int image_size = 0;
int image_received = 0;
unsigned char* image_buffer = NULL;

printf("\nPhase 1: Waiting for header...\n");

// Receive header
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

header[HEADER_SIZE] = '\0';
image_size = atoi(header);

printf("Image size: %d\n", image_size);

if (image_size <= 0 || image_size > MAX_IMAGE_SIZE)
{
    printf("Invalid image size\n");
    return;
}

// Allocate buffer
image_buffer = (unsigned char*)malloc(image_size);
if (!image_buffer)
{
    printf("Memory allocation failed\n");
    return;
}

printf("Receiving image...\n");

// Receive image
while (image_received < image_size)
{
    int n = recv(sckConnImg, image_buffer + image_received, image_size - image_received, 0);
    if (n <= 0) break;

    image_received += n;

    // PARTIAL simulation
    if (mode == 2 && image_received > image_size / 2)
    {
        printf("Simulating PARTIAL IMAGE\n");
        break;
    }
}

// EXTRA DATA simulation
if (mode == 1 && image_received > 0)
{
    printf("Simulating EXTRA DATA\n");

    int extra = 5000;

    unsigned char* new_buffer = (unsigned char*)malloc(image_received + extra);

    if (!new_buffer)
    {
        printf("Memory allocation failed\n");
        free(image_buffer);
        return;
    }

    memcpy(new_buffer, image_buffer, image_received);
    memset(new_buffer + image_received, 0xFF, extra);

    free(image_buffer);

    image_buffer = new_buffer;
    image_received += extra;
}

// Save
if (image_received > 0)
{
    printf("Received %d bytes\n", image_received);
    save_image(image_buffer, image_received);
}

free(image_buffer);

run_flag = 0;
mode = 0;

}

//-----------------------------------
// MAIN
//-----------------------------------
int main(int argc, char* argv[])
{
printf("\nRead Image : Press Q to terminate at any time\n");

if (argc < 2)
{
    printf("Usage: ./ReadImage <ip>\n");
    return 1;
}

run_flag = 200;

pthread_create(&kb_thread, NULL, kb_handler, NULL);
pthread_create(&tmr_thread, NULL, tmr_handler, NULL);

if (argc >= 3)
{
    strncpy(filename, argv[2], sizeof(filename) - 1);
    filename[sizeof(filename) - 1] = '\0';
}
else
{
    get_timestamp_filename(filename, sizeof(filename));
}

printf("Filename: %s\n", filename);

ConnectImage(argv[1]);

int ticker = 0;

while (run_flag)
{
    if (sckConnImg >= 0)
    {
        recv_jpeg();
    }

    usleep(10000);

    if (ticker++ > 10)
    {
        printf(".");
        fflush(stdout);
        ticker = 0;
    }
}

close(sckConnImg);
usleep(100000);

return 0;

}
