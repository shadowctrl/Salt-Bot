class Formatter {

    /**
     * Formats milliseconds into a string in the format HH:MM:SS.
     * @param ms - The time in milliseconds.
     * @return A string representing the time in HH:MM:SS format.
    */
    public static msToTime(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;

        const formattedHours = String(hours).padStart(2, "0");
        const formattedMinutes = String(minutes).padStart(2, "0");
        const formattedSeconds = String(remainingSeconds).padStart(2, "0");

        return `${formattedHours}:${formattedMinutes}:${formattedSeconds}`;
    }

    /**
     * Formats a number of seconds into a human-readable uptime string.
     * @param seconds - The number of seconds to format.
     * @return A string representing the uptime in days, hours, and minutes.
     */
    public static formatUptime(seconds: number): string {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor(((seconds % 86400) % 3600) / 60);
        const parts = [];

        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);

        return parts.join(" ") || "< 1m";
    }

    /**
     * Truncates a string to a specified maximum length and appends an ellipsis if necessary.
     * @param text - The text to truncate.
     * @param maxLength - The maximum length of the text (default is 50).
     * @param ellipsis - The string to append if truncation occurs (default is "...").
     * @return The truncated text.
     */
    public static truncateText(
        text: string,
        maxLength: number = 50,
        ellipsis: string = "..."
    ): string {
        if (Array.from(text).length > maxLength) {
            text = text.slice(0, maxLength) + ellipsis;
        }
        return text;
    }

    /**
     * Formats a number with commas as thousands separators.
     * @param num - The number to format.
     * @return A string representing the formatted number.
     */
    public static hyperlink(text: string, url: string): string {
        const escapedText = text.replace(/\[/g, "［").replace(/\]/g, "］");
        return `[${escapedText}](${url})`;
    }

    /**
     * Formats a number of bytes into a human-readable string with appropriate units.
     * @param bytes - The number of bytes to format.
     * @return A string representing the formatted size (e.g., "1.23 MB").
     */
    public static formatBytes(bytes: number): string {
        if (bytes === 0) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
    }
}

export default Formatter;
