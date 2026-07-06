#include <iostream>
#include <string>

int main() {
    std::cout << "InferenceEngine Started." << std::endl;
    std::string input;
    
    // Simple IPC via Stdin/Stdout
    while (std::getline(std::cin, input)) {
        if (input == "EXIT") {
            break;
        }
        // Simulate LLM response
        std::cout << "C++ Engine received: " << input << " -> " << "[LLM output simulated]" << std::endl;
    }
    
    return 0;
}
