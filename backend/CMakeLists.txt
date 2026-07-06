cmake_minimum_required(VERSION 3.15)
project(InferenceEngine CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_executable(InferenceEngine main.cpp)

# In the future, we would add_subdirectory(llama.cpp) here and link it.
