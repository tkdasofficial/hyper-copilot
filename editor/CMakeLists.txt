cmake_minimum_required(VERSION 3.16)
project(HyperEditor LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# Optimization flags
if(CMAKE_BUILD_TYPE STREQUAL "Release")
    add_compile_options(-O3 -march=native -pipe)
endif()

find_package(PkgConfig QUIET)

# Source files
set(SOURCES
    src/main.cpp
    src/scene_builder.cpp
    src/ffmpeg_graph.cpp
    src/caption_renderer.cpp
)

set(HEADERS
    src/scene_builder.hpp
    src/ffmpeg_graph.hpp
    src/caption_renderer.hpp
)

add_executable(hyper_editor ${SOURCES} ${HEADERS})

target_include_directories(hyper_editor PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/src
)

# Optional threading support
find_package(Threads REQUIRED)
target_link_libraries(hyper_editor PRIVATE Threads::Threads)
